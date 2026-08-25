"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { TransactionFormSheet } from "@/components/transaction-form-sheet";
import { TransactionDetailSheet } from "@/components/transaction-detail-sheet";
import { LineItemFormSheet } from "@/components/line-item-form-sheet";
import { BulkCategorizeBar } from "@/components/bulk-categorize-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategorizeSuggestionsSheet, type CategorizeSuggestionRow } from "@/components/categorize-suggestions-sheet";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToScannedReceiptLineItem, type ScannedReceiptLineItemRow } from "@/lib/supabase/mappers";
import {
  updateScannedReceiptLineItem,
  linkLineItemRefund,
  unlinkLineItemRefund,
  deleteScannedReceiptLineItem,
  createManualLineItem,
} from "@/lib/receipt-line-items";
import { createAndLinkRefundTransaction } from "@/lib/receipt-refunds";
import { decideCategoryRuleLearnAction } from "@/lib/receipt-resolution";
import { useInventoryStore } from "@/lib/store";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { categoriesForTransaction, sortByLabel } from "@/lib/selectors";
import { formatCurrency, parseCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRemountKey } from "@/hooks/use-remount-key";
import { usePaginated } from "@/hooks/use-paginated";
import { LoadMoreButton } from "@/components/load-more-button";
import { categorizationProvider, REVIEW_THRESHOLD, VisionDetectionError, type CategorySuggestion } from "@/lib/ai";
import type { ScannedReceiptLineItem, Transaction } from "@/lib/types";

// AI category suggestion (Household Ledger Implementation Plan, Workstream
// 3 batch) — an on-demand batch pass over currently-uncategorized
// transactions, not a database-triggered background job (see the "Suggest
// categories" banner and its handler below for why that's the deliberate,
// simpler interpretation here). Cap keeps one batch call fast — stricter
// than (not "matching," they're two independent constants) the API
// route's own MAX_TRANSACTIONS guard (60, src/app/api/v1/finance/
// categorize/route.ts), so this cap is what actually binds today.
const MAX_AI_CATEGORIZE_BATCH = 30;

type DateScope = "all" | "month" | "custom";

function groupByDay(transactions: Transaction[]): [string, Transaction[]][] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    // parseCalendarDate, not `new Date(t.occurredAt)` directly —
    // occurredAt is a bare "YYYY-MM-DD" (Postgres `date` column), and the
    // raw Date constructor parses that as UTC midnight; today/yesterday
    // above are real local-time boundaries, so comparing a UTC-midnight
    // date against them showed anyone west of UTC their receipt from
    // today under "Yesterday". See lib/format.ts's own comment on this
    // exact bug class.
    const d = parseCalendarDate(t.occurredAt);
    const label =
      d.toDateString() === today
        ? "Today"
        : d.toDateString() === yesterday
          ? "Yesterday"
          : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const list = map.get(label) ?? [];
    list.push(t);
    map.set(label, list);
  }
  return Array.from(map.entries());
}

export default function TransactionsListPage() {
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  // Tag-style multi-category links (Categories Foundation workstream) —
  // display only here (the row-list badges below); create/edit wiring
  // lives entirely in TransactionFormSheet, which reads/writes this same
  // store state itself.
  const transactionCategoryLinks = useInventoryStore((s) => s.transactionCategories);
  const categoryRules = useInventoryStore((s) => s.categoryRules);
  const transactionAttachments = useInventoryStore((s) => s.transactionAttachments);
  const createTransaction = useInventoryStore((s) => s.createTransaction);
  const createLinkedTransactionPair = useInventoryStore((s) => s.createLinkedTransactionPair);
  const updateTransaction = useInventoryStore((s) => s.updateTransaction);
  const trashTransaction = useInventoryStore((s) => s.trashTransaction);
  const createCategoryRule = useInventoryStore((s) => s.createCategoryRule);
  const deleteCategoryRule = useInventoryStore((s) => s.deleteCategoryRule);
  // Bulk categorize workstream — the only store write this feature needs;
  // additive tag-style add, same as the single-transaction category picker.
  // Also reused by AI categorize's accept/apply actions below.
  const addTransactionCategory = useInventoryStore((s) => s.addTransactionCategory);

  const searchParams = useSearchParams();
  const defaultAccountId = searchParams.get("accountId") ?? undefined;

  // Filters are three independent dimensions, not one flat exclusive
  // choice — you can search "milk" AND restrict to this month AND
  // uncategorized-only all at once. Each reads its initial value once from
  // the URL (same lazy-initializer, read-only-on-mount convention already
  // used for ?open=new below and elsewhere in this app — e.g. Trash's
  // ?tab=, Activity's ?domain= — not live two-way sync).
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [dateScope, setDateScope] = useState<DateScope>(() => {
    const scope = searchParams.get("dateScope");
    return scope === "month" || scope === "custom" ? scope : "all";
  });
  const [customFrom, setCustomFrom] = useState(() => searchParams.get("from") ?? "");
  const [customTo, setCustomTo] = useState(() => searchParams.get("to") ?? "");
  const [uncategorizedOnly, setUncategorizedOnly] = useState(() => searchParams.get("uncategorized") === "1");
  // "all" (not "" — Radix Select's SelectItem can't take an empty-string
  // value) means no category filter.
  const [categoryFilterId, setCategoryFilterId] = useState(() => searchParams.get("category") ?? "all");
  // Deep-link from Account Detail's "Add transaction" (?open=new&accountId=...)
  // — starts the create sheet already open, pre-filled with that account,
  // rather than landing on a list and requiring a second click to find
  // the "+" button. Read once via the useState initializer (not an
  // effect + setState, which would cost an extra render for no benefit
  // here — the query param never changes without a full navigation).
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("open") === "new");
  const [createKey, bumpCreateKey] = useRemountKey();
  const [editOpen, setEditOpen] = useState(false);
  // Deep-link from a search result (?transactionId=...) — opens straight to
  // that transaction's detail drawer instead of landing on the bare list.
  const [detailId, setDetailId] = useState<string | null>(() => searchParams.get("transactionId"));
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);
  const [lineItemsByTransaction, setLineItemsByTransaction] = useState<Record<string, ScannedReceiptLineItem[]>>({});
  // Grouped once per transactionCategoryLinks change, not re-filtered per
  // row on every render — same reasoning as lineItemsByTransaction above,
  // just synchronous (transaction_categories is already in the store's
  // hydrated bundle, no separate fetch needed the way line items require).
  const categoryIdsByTransaction = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tc of transactionCategoryLinks) {
      (map[tc.transactionId] ??= []).push(tc.categoryId);
    }
    return map;
  }, [transactionCategoryLinks]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Bulk categorize (bulk-select) — same selectMode + Set<id> convention
  // Trash's InventoryTrashPanel uses for its own multi-select (see
  // src/app/(shell)/trash/page.tsx), not a new pattern invented here.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingLineItem, setEditingLineItem] = useState<ScannedReceiptLineItem | null>(null);
  const [deleteLineItemConfirm, setDeleteLineItemConfirm] = useState<ScannedReceiptLineItem | null>(null);
  const [addingItemForTransactionId, setAddingItemForTransactionId] = useState<string | null>(null);

  // AI category suggestions (Household Ledger Implementation Plan,
  // Workstream 3 batch) — client-side only, never persisted: a "Suggest
  // categories" pass fills this map, each row shows an inline "AI: <name>"
  // badge with a one-tap Accept (which just calls addTransactionCategory,
  // same as any manual pick), and "Review & apply" opens the fuller sheet
  // to adjust/skip before a batch apply. Nothing in either path calls
  // addTransactionCategory without this explicit per-suggestion or
  // per-batch confirmation step.
  const [suggestions, setSuggestions] = useState<Record<string, CategorySuggestion>>({});
  const [suggesting, setSuggesting] = useState(false);
  const [reviewSuggestionsOpen, setReviewSuggestionsOpen] = useState(false);
  // Forces CategorizeSuggestionsSheet to remount (and reseed its per-row
  // choices from the latest suggestions) each time it's freshly opened —
  // same always-mounted-with-`open`-as-a-prop situation useRemountKey's own
  // doc comment describes, bumped in the same click handler that opens it.
  const [reviewSuggestionsKey, bumpReviewSuggestionsKey] = useRemountKey();

  // Line items nested right in the list (not only behind the detail
  // drawer) — one bulk fetch scoped to every receipt-sourced transaction
  // currently loaded, grouped client-side, so expand/collapse is instant
  // with no per-row spinner. Depends on the store's own `transactions`
  // reference (stable unless the underlying data actually changed), not
  // the locally re-sorted/filtered array, so this only refetches when
  // real data changes — e.g. after confirming more drafts elsewhere.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const receiptScanIds = transactions.filter((t) => t.source === "receipt_scan" && !t.trashedAt).map((t) => t.id);
      const grouped: Record<string, ScannedReceiptLineItem[]> = {};
      if (receiptScanIds.length > 0) {
        const { data } = await getSupabaseBrowserClient().from("scanned_receipt_line_items").select("*").in("transaction_id", receiptScanIds);
        for (const row of (data ?? []) as ScannedReceiptLineItemRow[]) {
          const item = rowToScannedReceiptLineItem(row);
          if (!item.transactionId) continue;
          (grouped[item.transactionId] ??= []).push(item);
        }
      }
      if (!cancelled) setLineItemsByTransaction(grouped);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [transactions]);

  function toggleExpanded(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  /** Applies one category to every selected transaction (additive tag, never clears existing ones) via the same addTransactionCategory the single-transaction category picker uses, then clears the selection. Defensively re-excludes transfer/payment ids even though the checkbox UI already can't select one — a transaction's type could in principle change (e.g. a Realtime update) between when it was checked and when Apply is tapped, and those types never take a category (see the row-render comment above for why). */
  function handleBulkApplyCategory(categoryId: string) {
    const ids = Array.from(selectedIds).filter((id) => {
      const t = transactions.find((txn) => txn.id === id);
      return t && t.type !== "transfer" && t.type !== "payment";
    });
    for (const id of ids) addTransactionCategory(id, categoryId);
    const categoryName = financeCategories.find((c) => c.id === categoryId)?.name ?? "category";
    toast.success(`Added "${categoryName}" to ${ids.length} transaction${ids.length === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  async function handleSaveLineItem(patch: {
    standardName: string | null;
    brand: string | null;
    quantity: number;
    unitPriceCents: number | null;
    lineTotalCents: number | null;
  }) {
    if (!editingLineItem) return;
    const result = await updateScannedReceiptLineItem(editingLineItem, patch);
    if (!result.ok) {
      toast.error(`Couldn't save: ${result.error}`);
      return;
    }
    const transactionId = result.item.transactionId;
    if (transactionId) {
      setLineItemsByTransaction((prev) => ({
        ...prev,
        [transactionId]: (prev[transactionId] ?? []).map((li) => (li.id === result.item.id ? result.item : li)),
      }));
    }
    toast.success("Item updated");
  }

  // Only patches the list's own bulk-fetched copy — doesn't also call
  // setEditingLineItem(updated). The confirm-return flow (like the plain
  // edit save) closes the sheet right after this fires, which already
  // nulls editingLineItem via onOpenChange; resurrecting it here with a
  // non-null value right as that unmount is in flight risks the same kind
  // of race the Bulk Statement Review loadBatch bug hit.
  function patchLineItemInList(updated: ScannedReceiptLineItem) {
    if (!updated.transactionId) return;
    setLineItemsByTransaction((prev) => ({
      ...prev,
      [updated.transactionId!]: (prev[updated.transactionId!] ?? []).map((li) => (li.id === updated.id ? updated : li)),
    }));
  }

  async function handleCreateAndLinkRefund(values: { amount: number; occurredAt: string }) {
    if (!editingLineItem) return;
    const originalTxn = transactions.find((t) => t.id === editingLineItem.transactionId);
    if (!originalTxn) return;
    const result = await createAndLinkRefundTransaction(editingLineItem, {
      accountId: originalTxn.accountId,
      occurredAt: values.occurredAt,
      amount: values.amount,
      merchant: originalTxn.merchant,
      description: `Refund: ${editingLineItem.standardName ?? editingLineItem.rawItem}`,
    });
    if (!result.ok) {
      toast.error(`Couldn't record the refund: ${result.error}`);
      return;
    }
    patchLineItemInList(result.item);
    toast.success("Item marked as returned");
  }

  async function handleLinkExistingRefund(refundTransactionId: string, refundedAmountCents: number) {
    if (!editingLineItem) return;
    const result = await linkLineItemRefund(editingLineItem, refundTransactionId, refundedAmountCents);
    if (!result.ok) {
      toast.error(`Couldn't link the refund: ${result.error}`);
      return;
    }
    patchLineItemInList(result.item);
    toast.success("Item marked as returned");
  }

  async function handleUndoReturn() {
    if (!editingLineItem) return;
    const result = await unlinkLineItemRefund(editingLineItem);
    if (!result.ok) {
      toast.error(`Couldn't undo the return: ${result.error}`);
      return;
    }
    patchLineItemInList(result.item);
    toast.success("Return undone");
  }

  async function handleDeleteLineItem() {
    if (!deleteLineItemConfirm) return;
    const result = await deleteScannedReceiptLineItem(deleteLineItemConfirm.id);
    if (!result.ok) {
      toast.error(`Couldn't delete: ${result.error}`);
      return;
    }
    const transactionId = deleteLineItemConfirm.transactionId;
    if (transactionId) {
      setLineItemsByTransaction((prev) => ({
        ...prev,
        [transactionId]: (prev[transactionId] ?? []).filter((li) => li.id !== deleteLineItemConfirm.id),
      }));
    }
    setEditingLineItem(null);
    toast.success("Item deleted");
  }

  async function handleCreateLineItem(values: {
    standardName: string;
    brand: string | null;
    quantity: number;
    unitPriceCents: number | null;
    lineTotalCents: number | null;
  }) {
    if (!addingItemForTransactionId) return;
    const result = await createManualLineItem(currentHouseholdId, addingItemForTransactionId, values);
    if (!result.ok) {
      toast.error(`Couldn't add item: ${result.error}`);
      return;
    }
    setLineItemsByTransaction((prev) => ({
      ...prev,
      [addingItemForTransactionId]: [...(prev[addingItemForTransactionId] ?? []), result.item],
    }));
    setExpandedIds((prev) => new Set(prev).add(addingItemForTransactionId));
    toast.success("Item added");
  }

  const active = transactions.filter((t) => !t.trashedAt);
  // Active only, alphabetical — same shape every other category dropdown
  // in this app uses (e.g. AccountFormSheet, RecurringBillFormSheet), so
  // an archived category can't be picked as a filter (nothing on screen
  // would ever match it if it were active-only-hidden anyway, since
  // finance-categories.tsx's "archive" flow only stops it from being
  // newly assigned, not from staying on already-categorized transactions
  // — but filtering by a category you can no longer see in that other
  // dropdown either would be a confusing exception to carve out here).
  const activeFinanceCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const now = new Date();
  const fromTime = dateScope === "custom" && customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
  const toTime = dateScope === "custom" && customTo ? new Date(`${customTo}T23:59:59`).getTime() : null;
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = active.filter((t) => {
    if (dateScope === "month") {
      // parseCalendarDate — see groupByDay's own comment above; the raw
      // Date constructor on a bare "YYYY-MM-DD" parses as UTC midnight and
      // could silently drop the 1st of the month from "This month".
      const d = parseCalendarDate(t.occurredAt);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    } else if (dateScope === "custom") {
      const occurred = parseCalendarDate(t.occurredAt).getTime();
      if (fromTime !== null && occurred < fromTime) return false;
      if (toTime !== null && occurred > toTime) return false;
    }

    if (uncategorizedOnly && (t.categoryId || (t.type !== "expense" && t.type !== "income" && t.type !== "refund"))) return false;

    // categoriesForTransaction, not a bare t.categoryId === categoryFilterId
    // check — same reasoning as uncategorizedForSuggestion below: a
    // transaction's tag-style categories (transactionCategoryLinks) are
    // what the row's own badges actually display, and can exist without a
    // primary categoryId set at all.
    if (
      categoryFilterId !== "all" &&
      !categoriesForTransaction(t, categoryIdsByTransaction[t.id] ?? [], financeCategories).some((c) => c.id === categoryFilterId)
    )
      return false;

    if (trimmedQuery) {
      const merchantMatch = t.merchant?.toLowerCase().includes(trimmedQuery) || t.description?.toLowerCase().includes(trimmedQuery);
      const itemMatch = (lineItemsByTransaction[t.id] ?? []).some(
        (li) =>
          li.standardName?.toLowerCase().includes(trimmedQuery) ||
          li.rawItem.toLowerCase().includes(trimmedQuery) ||
          li.brand?.toLowerCase().includes(trimmedQuery)
      );
      if (!merchantMatch && !itemMatch) return false;
    }

    return true;
  });

  const sorted = [...filtered].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  // "Load more" over the fully-loaded, already-filtered+sorted list — the
  // reset key covers every filter dimension above (date scope/custom
  // range/search/uncategorized-only/category) so changing any of them jumps
  // back to the first page, but stays stable across a Realtime-driven
  // update to `transactions` itself, so a scrolled-down user's progress
  // survives a live edit elsewhere.
  const { visible: paginatedTransactions, hasMore, remaining, pageSize, loadMore } = usePaginated(
    sorted,
    `${dateScope}:${customFrom}:${customTo}:${trimmedQuery}:${uncategorizedOnly}:${categoryFilterId}`
  );
  const groups = groupByDay(paginatedTransactions);
  const detailTxn = transactions.find((t) => t.id === detailId) ?? null;
  const detailAccount = accounts.find((a) => a.id === detailTxn?.accountId);
  const detailAttachment = transactionAttachments.find((a) => a.transactionId === detailTxn?.id);

  const editingLineItemTxn = editingLineItem ? transactions.find((t) => t.id === editingLineItem.transactionId) : undefined;
  const refundOptionsForEditingItem = editingLineItemTxn
    ? transactions
        .filter((t) => t.type === "refund" && !t.trashedAt && t.accountId === editingLineItemTxn.accountId)
        .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    : [];
  const linkedRefundTxn = editingLineItem?.refundTransactionId ? (transactions.find((t) => t.id === editingLineItem.refundTransactionId) ?? null) : null;

  /** "Remember this category" from TransactionFormSheet — decides create/replace/no-op (decideCategoryRuleLearnAction), then makes the actual write. Shared by both the create and edit onSubmitSingle handlers below rather than duplicated. */
  function applyCategoryRuleLearning(merchant: string | null, categoryId: string | null) {
    if (!merchant || !categoryId) return;
    const action = decideCategoryRuleLearnAction(merchant, categoryId, categoryRules);
    if (action.kind === "none") return;
    if (action.kind === "replace") deleteCategoryRule(action.staleRuleId);
    createCategoryRule({ matchField: "merchant", matchType: "contains", matchValue: merchant, categoryId });
    toast.success(`Future "${merchant}" transactions will be categorized automatically`, { duration: 3000 });
  }

  // AI category suggestion — batch pass over currently-uncategorized
  // transactions. See MAX_AI_CATEGORIZE_BATCH's comment for why this is an
  // on-demand pass rather than a background job. Most-recent-first so a
  // household with more uncategorized transactions than the cap gets
  // suggestions for the ones they're most likely reviewing right now.
  //
  // Scoped to `filtered` (the page's own date/search/uncategorized-only
  // filters), not the full household `transactions` list — the banner's
  // own count ("Suggest categories for N uncategorized transactions") sits
  // right above the filtered list, so a batch that silently reached beyond
  // what's on screen would mismatch what the user is looking at (e.g. "This
  // month" + a search narrowing to 2 visible uncategorized rows, but the
  // batch/count still covering up to 30 uncategorized rows household-wide).
  function uncategorizedForSuggestion(): Transaction[] {
    // categoriesForTransaction, not a bare !t.categoryId check — a
    // transaction can have real tag-style categories with no primary
    // categoryId set (e.g. created via a caller that only passed
    // categoryIds), and !t.categoryId alone would wrongly pull it into
    // the AI batch. Worse: since addTransactionCategory backfills a
    // missing primary categoryId, accepting that AI guess would silently
    // become this transaction's *primary* category even though it
    // already had real ones — exactly the "never automatic" guarantee
    // this feature is supposed to keep.
    // `filtered` already excludes trashed transactions (derived from
    // `active`), so no separate !t.trashedAt check is needed here.
    return filtered
      .filter(
        (t) =>
          (t.type === "expense" || t.type === "income" || t.type === "refund") &&
          categoriesForTransaction(t, categoryIdsByTransaction[t.id] ?? [], financeCategories).length === 0
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, MAX_AI_CATEGORIZE_BATCH);
  }

  async function handleSuggestCategories() {
    const targets = uncategorizedForSuggestion();
    if (targets.length === 0) {
      toast("No uncategorized transactions to suggest categories for.");
      return;
    }
    const activeCategories = financeCategories.filter((c) => c.status === "active");
    if (activeCategories.length === 0) {
      toast.error("Add a category first — there's nothing for AI to suggest from yet.");
      return;
    }

    setSuggesting(true);
    try {
      const results = await categorizationProvider.suggestCategories(
        targets.map((t) => ({ id: t.id, merchant: t.merchant, description: t.description, amount: t.amount })),
        activeCategories.map((c) => ({ id: c.id, name: c.name }))
      );
      const confident = results.filter((r) => r.categoryId !== null);
      if (confident.length === 0) {
        toast("AI couldn't confidently match a category for any of these.");
        return;
      }
      setSuggestions((prev) => {
        const next = { ...prev };
        for (const r of confident) next[r.transactionId] = r;
        return next;
      });
      toast.success(`${confident.length} category suggestion${confident.length === 1 ? "" : "s"} ready to review`);
    } catch (error) {
      const message = error instanceof VisionDetectionError ? error.message : "Couldn't suggest categories. Please try again.";
      toast.error(message);
    } finally {
      setSuggesting(false);
    }
  }

  function dismissSuggestion(transactionId: string) {
    setSuggestions((prev) => {
      const next = { ...prev };
      delete next[transactionId];
      return next;
    });
  }

  /** One-tap accept straight from the row badge — same write as picking a category by hand in TransactionFormSheet, just via the suggested categoryId. Defensively re-checks the category is still active (the row's own suggestedCategory lookup already does this for the UI, but a suggestion could in principle be accepted via another path later) and below-threshold suggestions never reach here since the accept button itself is hidden for them. */
  function acceptSuggestion(transactionId: string) {
    const suggestion = suggestions[transactionId];
    if (!suggestion?.categoryId) return;
    const category = financeCategories.find((c) => c.id === suggestion.categoryId);
    if (!category || category.status !== "active") {
      dismissSuggestion(transactionId);
      toast.error("That category is no longer available — dismissed the suggestion.");
      return;
    }
    addTransactionCategory(transactionId, suggestion.categoryId);
    dismissSuggestion(transactionId);
    toast.success("Category applied");
  }

  function handleApplySuggestions(accepted: { transactionId: string; categoryId: string }[]) {
    // The sheet seeds its per-row category picker from the suggestion at
    // the moment it opened and doesn't re-check status on Apply — this is
    // the one place both the sheet and the inline accept path converge,
    // so the active-category guard lives here rather than duplicated in
    // the sheet component too. A category archived/trashed between
    // suggestion and Apply is silently dropped instead of tagged.
    const valid = accepted.filter((a) => financeCategories.some((c) => c.id === a.categoryId && c.status === "active"));
    for (const a of valid) addTransactionCategory(a.transactionId, a.categoryId);
    setSuggestions((prev) => {
      const next = { ...prev };
      for (const a of accepted) delete next[a.transactionId];
      return next;
    });
    if (valid.length > 0) toast.success(`Applied ${valid.length} categor${valid.length === 1 ? "y" : "ies"}`);
    if (valid.length < accepted.length) toast.error(`${accepted.length - valid.length} category no longer available — skipped.`);
  }

  const suggestionCount = Object.keys(suggestions).length;
  const uncategorizedCount = uncategorizedForSuggestion().length;
  // Same stale-suggestion guard the inline row badge already applies
  // (displayedCategories.length === 0 above) — without it, a transaction
  // the user manually recategorized after its suggestion was generated
  // (but before opening this sheet) would still show up pre-checked here,
  // and Apply would additively stack the AI's now-outdated guess
  // alongside the category the user actually picked.
  const suggestionRows: CategorizeSuggestionRow[] = Object.values(suggestions)
    .map((s) => ({ transaction: transactions.find((t) => t.id === s.transactionId), suggestedCategoryId: s.categoryId, confidence: s.confidence }))
    .filter(
      (row): row is CategorizeSuggestionRow =>
        !!row.transaction && categoriesForTransaction(row.transaction, categoryIdsByTransaction[row.transaction.id] ?? [], financeCategories).length === 0
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Transactions</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Every transaction across your accounts.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/scan" className="tap-target flex size-11 items-center justify-center rounded-md bg-surface-muted text-ink" aria-label="Scan receipt">
            <Icon name="camera" size={18} />
          </Link>
          <Button size="icon-lg" className="rounded-md" onClick={() => { bumpCreateKey(); setCreateOpen(true); }} aria-label="Add transaction" disabled={accounts.length === 0}>
            <Icon name="plus" size={18} />
          </Button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search by vendor or item…" />
        {active.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            {selectMode ? "Cancel" : "Select"}
          </Button>
        )}
      </div>

      {/* Links to the dedicated AI card on the Dashboard (#ask-ai) rather
          than duplicating that UI here — one Finance AI surface, not two
          to keep in sync. */}
      <Link href="/finance/dashboard#ask-ai" className="flex items-center gap-1.5 text-caption font-medium text-yellow-text">
        <Icon name="ai" size={14} />
        Ask AI about your spending
        <Icon name="chevronRight" size={12} />
      </Link>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {([
            ["all", "All"],
            ["month", "This month"],
            ["custom", "Custom dates"],
          ] as [DateScope, string][]).map(([value, label]) => (
            <FilterChip key={value} label={label} active={dateScope === value} onClick={() => setDateScope(value)} />
          ))}
          <FilterChip label="Uncategorized" active={uncategorizedOnly} onClick={() => setUncategorizedOnly((v) => !v)} />
          {activeFinanceCategories.length > 0 && (
            <Select value={categoryFilterId} onValueChange={setCategoryFilterId}>
              <SelectTrigger
                className={cn(
                  // data-[size=default]:h-auto, not just h-auto — the base
                  // SelectTrigger sets height via that same data-scoped key
                  // (data-[size=default]:h-8), a different utility "name"
                  // from tailwind-merge's point of view than a plain h-*
                  // class, so a plain h-auto here doesn't actually conflict
                  // with/override it; both survived and the fixed 32px one
                  // won, which is why this chip rendered taller/boxier than
                  // the plain-button FilterChips next to it (no fixed
                  // height at all, sized purely by their own padding).
                  "data-[size=default]:h-auto shrink-0 gap-1 rounded-full border px-3 py-1.5 text-caption font-medium",
                  categoryFilterId !== "all" ? "border-ink bg-ink text-white [&_svg]:text-white" : "border-border bg-white text-ink"
                )}
              >
                {/* Children override, not the `placeholder` prop — "all" is
                    a real matching SelectItem (Radix Select can't take an
                    empty-string item value), so the placeholder would never
                    show; this keeps the at-rest label as short as the
                    other chips ("All", "This month") instead of falling
                    back to the full "All categories" item text. */}
                <SelectValue>{categoryFilterId === "all" ? "Category" : activeFinanceCategories.find((c) => c.id === categoryFilterId)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {activeFinanceCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        {/* Select-all convention mirrors Trash's InventoryTrashPanel — scoped to
            the currently filtered+sorted list, not the whole account. Also
            scoped to categorizable transactions only — transfers/payments
            never take a category (see the row-render comment below), so
            they're excluded here the same way their checkbox is. */}
        {/* Scoped to paginatedTransactions (what's actually rendered right
            now), not the full filtered set — selecting rows a "Load more"
            tap hasn't revealed yet would silently check items with no
            checkbox on screen to show for it. */}
        {selectMode && paginatedTransactions.some((t) => t.type !== "transfer" && t.type !== "payment") && (
          <button
            type="button"
            onClick={() =>
              setSelectedIds((prev) => {
                const selectable = paginatedTransactions.filter((t) => t.type !== "transfer" && t.type !== "payment");
                const allVisibleSelected = selectable.every((t) => prev.has(t.id));
                if (allVisibleSelected) {
                  const next = new Set(prev);
                  for (const t of selectable) next.delete(t.id);
                  return next;
                }
                return new Set([...prev, ...selectable.map((t) => t.id)]);
              })
            }
            className="shrink-0 text-caption font-medium text-ink underline underline-offset-2"
          >
            {paginatedTransactions.filter((t) => t.type !== "transfer" && t.type !== "payment").every((t) => selectedIds.has(t.id)) ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {dateScope === "custom" && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">From</label>
            <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-11" />
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">To</label>
            <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-11" />
          </div>
        </div>
      )}

      {/* AI category suggestion — a distinct banner, deliberately kept out of
          the filter-chip row and out of the transaction list's own
          row-selection affordances (a parallel workstream owns bulk-select
          on this page) so the two don't visually collide. */}
      {accounts.length > 0 &&
        (suggestionCount > 0 ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-yellow/10 px-4 py-3">
            <p className="flex items-center gap-1.5 text-caption font-medium text-ink">
              <Icon name="ai" size={14} className="shrink-0 text-yellow" />
              {suggestionCount} AI suggestion{suggestionCount === 1 ? "" : "s"} ready to review
            </p>
            <div className="flex shrink-0 items-center gap-3">
              <button type="button" onClick={() => setSuggestions({})} className="tap-target text-caption text-muted-foreground">
                Dismiss
              </button>
              <button
                type="button"
                onClick={() => {
                  bumpReviewSuggestionsKey();
                  setReviewSuggestionsOpen(true);
                }}
                className="tap-target text-caption font-semibold text-yellow-text"
              >
                Review &amp; apply
              </button>
            </div>
          </div>
        ) : (
          uncategorizedCount > 0 && (
            <button
              type="button"
              onClick={handleSuggestCategories}
              disabled={suggesting}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white px-4 py-3 text-caption font-medium text-ink disabled:opacity-60"
            >
              <Icon name="ai" size={15} className="text-yellow" />
              {suggesting
                ? "Suggesting categories…"
                : `Suggest categories for ${uncategorizedCount} uncategorized transaction${uncategorizedCount === 1 ? "" : "s"}`}
            </button>
          )
        ))}

      {accounts.length === 0 ? (
        <EmptyState icon="receipt" title="Add an account first" description="Transactions belong to an account — add one from the Accounts tab to get started." />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No transactions"
          description={
            trimmedQuery || dateScope !== "all" || uncategorizedOnly || categoryFilterId !== "all"
              ? "Nothing matches these filters yet."
              : "Nothing here yet."
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([day, entries]) => (
            <div key={day}>
              <p className="mb-1.5 text-caption font-medium tracking-wide text-muted-foreground uppercase">{day}</p>
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {entries.map((t) => {
                  const displayedCategories = categoriesForTransaction(t, categoryIdsByTransaction[t.id] ?? [], financeCategories);
                  const suggestion = displayedCategories.length === 0 ? suggestions[t.id] : undefined;
                  // Re-validated at display/accept time, not just when the
                  // suggestion was first generated: a category can be
                  // archived/trashed while a suggestion still sits unapplied
                  // in state, and no manual category picker in this app
                  // allows picking a non-active category.
                  const suggestedCategory =
                    suggestion?.categoryId ? financeCategories.find((c) => c.id === suggestion.categoryId && c.status === "active") : undefined;
                  // Every other AI-suggestion surface in this app (capture/
                  // review's needsReview gate, appliance capture's
                  // lowConfidence gate) keeps a below-threshold guess from
                  // being one-tap-applicable — this inline accept button was
                  // the one path that didn't. Below threshold, the badge
                  // still shows the guess (useful information) but the
                  // accept checkmark is hidden; "Review & apply" (the sheet)
                  // is where a low-confidence suggestion can actually be
                  // applied, since it already labels rows below threshold.
                  const suggestionNeedsReview = suggestion ? suggestion.confidence < REVIEW_THRESHOLD : false;
                  const items = lineItemsByTransaction[t.id] ?? [];
                  // Every receipt-scan transaction can expand — not just
                  // ones that already have items. A real Costco receipt
                  // extracted its total correctly but zero line items; the
                  // old hasItems-only gate meant there was no way to reach
                  // "Add Item" for it short of a full re-scan.
                  const isScanSourced = t.source === "receipt_scan";
                  // Collapsed and non-interactive while selecting — bulk
                  // select is about picking rows, not diving into a
                  // receipt's line items, so the expand chevron is hidden
                  // for the duration (see below) rather than left active
                  // alongside the checkbox.
                  const isExpanded = isScanSourced && !selectMode && expandedIds.has(t.id);
                  const isSelected = selectedIds.has(t.id);
                  // Transfers/payments never take a category — the single-
                  // transaction form (transaction-form-sheet.tsx) already
                  // excludes them from the category picker entirely (PRD
                  // §15: "a transfer/payment is a shuffle between owned
                  // accounts, not a categorized expense/income"). Bulk-
                  // categorize is a category-tagging feature, so these
                  // rows aren't selectable for it — no checkbox, and a tap
                  // still opens the detail sheet rather than doing nothing.
                  const isCategorizable = t.type !== "transfer" && t.type !== "payment";
                  return (
                    <div key={t.id} className={cn(isSelected && "bg-surface-muted")}>
                      <div className="flex items-center gap-1 pr-2">
                        {selectMode && (
                          <div className="flex shrink-0 items-center pl-4">
                            {isCategorizable ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleSelected(t.id)}
                                className="size-4 shrink-0"
                                aria-label={`Select ${t.merchant ?? t.description ?? "transaction"}`}
                              />
                            ) : (
                              // Same footprint as the checkbox above, so a
                              // transfer/payment row's merchant text still
                              // lines up with every categorizable row's.
                              <div className="size-4 shrink-0" aria-hidden="true" />
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => (selectMode && isCategorizable ? toggleSelected(t.id) : setDetailId(t.id))}
                          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {displayedCategories.length > 0 ? (
                                displayedCategories.map((c) => (
                                  <span key={c.id} className={cn("rounded-full border px-1.5 py-0.5 text-micro font-medium", displayCodeBadgeClasses(c.id))}>
                                    {c.name}
                                  </span>
                                ))
                              ) : suggestedCategory ? (
                                <span className="flex items-center gap-1 rounded-full bg-yellow/20 px-1.5 py-0.5 text-micro font-medium text-ink">
                                  <Icon name="ai" size={10} /> {suggestedCategory.name}
                                </span>
                              ) : (
                                <span className="text-caption text-muted-foreground">Uncategorized</span>
                              )}
                              {items.length > 0 && (
                                <span className="text-micro text-muted-foreground">
                                  · {items.length} item{items.length === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                          </div>
                          {t.excludedFromReports && (
                            <Icon
                              name="eyeOff"
                              size={14}
                              className="shrink-0 text-muted-foreground"
                              role="img"
                              aria-label="Excluded from reports"
                            />
                          )}
                          <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                            {formatCurrency(t.amount, { showPositiveSign: true })}
                          </span>
                        </button>
                        {/* Hidden while selecting, same as the expand chevron below —
                            bulk select is about picking rows, and the row tap already
                            toggles selection instead of doing anything else. */}
                        {suggestedCategory && !suggestionNeedsReview && !selectMode && (
                          <button
                            type="button"
                            onClick={() => acceptSuggestion(t.id)}
                            aria-label={`Accept AI suggestion: ${suggestedCategory.name}`}
                            className="tap-target flex size-8 shrink-0 items-center justify-center rounded-full text-yellow-text"
                          >
                            <Icon name="check" size={17} />
                          </button>
                        )}
                        {isScanSourced && !selectMode && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(t.id)}
                            aria-label={isExpanded ? "Hide items" : "Show items"}
                            aria-expanded={isExpanded}
                            className="tap-target flex size-8 shrink-0 items-center justify-center text-muted-foreground"
                          >
                            <Icon name="chevronRight" size={16} className={cn("transition-transform", isExpanded && "rotate-90")} />
                          </button>
                        )}
                      </div>

                      {isExpanded && (
                        <div className="flex flex-col divide-y divide-border border-t border-border bg-surface-muted/50 pl-8">
                          {items.length === 0 && (
                            <p className="py-3 pr-4 text-caption text-muted-foreground">No items recorded for this receipt yet.</p>
                          )}
                          {items.map((li) => (
                            <button
                              key={li.id}
                              type="button"
                              onClick={() => setEditingLineItem(li)}
                              className="flex items-center gap-3 py-2 pr-4 text-left"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <p className="truncate text-caption font-medium text-ink">{li.standardName || li.rawItem}</p>
                                  {li.refundTransactionId && (
                                    <span className="shrink-0 rounded-full bg-badge-green-bg px-1.5 py-0.5 text-micro font-medium text-badge-green-text">
                                      Returned
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-micro text-muted-foreground">
                                  {li.brand ? `${li.brand} · ` : ""}Qty {li.quantity}
                                </p>
                              </div>
                              <span
                                className={cn(
                                  "shrink-0 text-caption font-medium",
                                  li.refundTransactionId ? "text-muted-foreground line-through" : "text-ink"
                                )}
                              >
                                {li.lineTotalCents !== null ? formatCurrency(li.lineTotalCents / 100) : "—"}
                              </span>
                              <Icon name="edit" size={13} className="shrink-0 text-muted-foreground" />
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setAddingItemForTransactionId(t.id)}
                            className="flex items-center gap-1.5 py-2 pr-4 text-left text-caption font-medium text-yellow-text"
                          >
                            <Icon name="plus" size={13} /> Add Item
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
        </div>
      )}

      {selectMode && (
        <BulkCategorizeBar selectedCount={selectedIds.size} categories={financeCategories} onApply={handleBulkApplyCategory} />
      )}

      <TransactionFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={financeCategories}
        categoryRules={categoryRules}
        defaultAccountId={defaultAccountId}
        onSubmitSingle={(values) => {
          createTransaction(values);
          if (values.rememberCategory) applyCategoryRuleLearning(values.merchant, values.categoryId);
          toast.success("Transaction added");
        }}
        onSubmitTransfer={(values) => {
          createLinkedTransactionPair(values);
          toast.success("Transfer added");
        }}
      />

      <TransactionFormSheet
        // Remounts whenever the target transaction changes so the form's
        // internal useState(initial...) fields actually reseed — this
        // sheet stays mounted across the whole page's lifetime (open is
        // just a prop, not a conditional render), so without a key every
        // edit after the first showed stale (or, before any edit, blank)
        // fields instead of the clicked transaction's real values.
        key={detailTxn?.id ?? "none"}
        open={editOpen}
        onOpenChange={setEditOpen}
        accounts={accounts}
        categories={financeCategories}
        categoryRules={categoryRules}
        initial={detailTxn ?? undefined}
        onSubmitSingle={(values) => {
          if (detailTxn) updateTransaction(detailTxn.id, values);
          if (values.rememberCategory) applyCategoryRuleLearning(values.merchant, values.categoryId);
          toast.success("Transaction updated");
        }}
        onSubmitTransfer={() => {
          /* editing never needs the transfer branch — initial is set, so TransactionFormSheet always takes the single-leg path */
        }}
      />

      <TransactionDetailSheet
        open={!!detailId && !editOpen}
        onOpenChange={(open) => !open && setDetailId(null)}
        transaction={detailTxn}
        account={detailAccount}
        attachment={detailAttachment}
        onEdit={() => setEditOpen(true)}
        onTrash={() => setTrashConfirmId(detailId)}
      />

      <LineItemFormSheet
        // Same always-mounted-with-open-prop pattern as TransactionFormSheet
        // above — needs a key tied to which item/transaction is targeted so
        // the form remounts (and reseeds) between different items instead
        // of reusing whatever the first-ever edit/add happened to seed.
        key={editingLineItem?.id ?? addingItemForTransactionId ?? "none"}
        open={!!editingLineItem || !!addingItemForTransactionId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingLineItem(null);
            setAddingItemForTransactionId(null);
          }
        }}
        lineItem={editingLineItem}
        createForTransactionId={addingItemForTransactionId}
        onSubmit={handleSaveLineItem}
        onCreate={handleCreateLineItem}
        refundOptions={refundOptionsForEditingItem}
        refundTransaction={linkedRefundTxn}
        onCreateAndLinkRefund={handleCreateAndLinkRefund}
        onLinkExistingRefund={handleLinkExistingRefund}
        onUndoReturn={handleUndoReturn}
        onRequestDelete={() => setDeleteLineItemConfirm(editingLineItem)}
      />

      <ConfirmDialog
        open={!!trashConfirmId}
        onOpenChange={(open) => !open && setTrashConfirmId(null)}
        title="Move this transaction to Trash?"
        description="Restorable for 30 days from Trash. If it's one leg of a transfer, both legs move together."
        confirmLabel="Move to Trash"
        icon="trash"
        onConfirm={() => {
          if (trashConfirmId) {
            trashTransaction(trashConfirmId);
            setDetailId(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!deleteLineItemConfirm}
        onOpenChange={(open) => !open && setDeleteLineItemConfirm(null)}
        title="Delete this item?"
        description="Permanently removes it from this receipt's itemized breakdown. This can't be undone, and doesn't affect the transaction's total or any linked refund."
        confirmLabel="Delete Item"
        tone="danger"
        icon="trash"
        onConfirm={handleDeleteLineItem}
      />

      <CategorizeSuggestionsSheet
        key={reviewSuggestionsKey}
        open={reviewSuggestionsOpen}
        onOpenChange={setReviewSuggestionsOpen}
        rows={suggestionRows}
        categories={financeCategories}
        onApply={handleApplySuggestions}
      />
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
        active ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
      )}
    >
      {label}
    </button>
  );
}
