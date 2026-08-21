"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { TransactionFormSheet } from "@/components/transaction-form-sheet";
import { TransactionDetailSheet } from "@/components/transaction-detail-sheet";
import { LineItemFormSheet } from "@/components/line-item-form-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { categoriesForTransaction } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRemountKey } from "@/hooks/use-remount-key";
import type { ScannedReceiptLineItem, Transaction } from "@/lib/types";

type DateScope = "all" | "month" | "custom";

function groupByDay(transactions: Transaction[]): [string, Transaction[]][] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const d = new Date(t.occurredAt);
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
  const [editingLineItem, setEditingLineItem] = useState<ScannedReceiptLineItem | null>(null);
  const [deleteLineItemConfirm, setDeleteLineItemConfirm] = useState<ScannedReceiptLineItem | null>(null);
  const [addingItemForTransactionId, setAddingItemForTransactionId] = useState<string | null>(null);

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
  const now = new Date();
  const fromTime = dateScope === "custom" && customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : null;
  const toTime = dateScope === "custom" && customTo ? new Date(`${customTo}T23:59:59`).getTime() : null;
  const trimmedQuery = query.trim().toLowerCase();

  const filtered = active.filter((t) => {
    if (dateScope === "month") {
      const d = new Date(t.occurredAt);
      if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
    } else if (dateScope === "custom") {
      const occurred = new Date(t.occurredAt).getTime();
      if (fromTime !== null && occurred < fromTime) return false;
      if (toTime !== null && occurred > toTime) return false;
    }

    if (uncategorizedOnly && (t.categoryId || (t.type !== "expense" && t.type !== "income" && t.type !== "refund"))) return false;

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
  const groups = groupByDay(sorted);
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

      <SearchBar value={query} onChange={setQuery} placeholder="Search by vendor or item…" />

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          ["all", "All"],
          ["month", "This month"],
          ["custom", "Custom dates"],
        ] as [DateScope, string][]).map(([value, label]) => (
          <FilterChip key={value} label={label} active={dateScope === value} onClick={() => setDateScope(value)} />
        ))}
        <FilterChip label="Uncategorized" active={uncategorizedOnly} onClick={() => setUncategorizedOnly((v) => !v)} />
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

      {accounts.length === 0 ? (
        <EmptyState icon="receipt" title="Add an account first" description="Transactions belong to an account — add one from the Accounts tab to get started." />
      ) : sorted.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="No transactions"
          description={trimmedQuery || dateScope !== "all" || uncategorizedOnly ? "Nothing matches these filters yet." : "Nothing here yet."}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([day, entries]) => (
            <div key={day}>
              <p className="mb-1.5 text-caption font-medium tracking-wide text-muted-foreground uppercase">{day}</p>
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {entries.map((t) => {
                  const displayedCategories = categoriesForTransaction(t, categoryIdsByTransaction[t.id] ?? [], financeCategories);
                  const items = lineItemsByTransaction[t.id] ?? [];
                  // Every receipt-scan transaction can expand — not just
                  // ones that already have items. A real Costco receipt
                  // extracted its total correctly but zero line items; the
                  // old hasItems-only gate meant there was no way to reach
                  // "Add Item" for it short of a full re-scan.
                  const isScanSourced = t.source === "receipt_scan";
                  const isExpanded = isScanSourced && expandedIds.has(t.id);
                  return (
                    <div key={t.id}>
                      <div className="flex items-center gap-1 pr-2">
                        <button type="button" onClick={() => setDetailId(t.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              {displayedCategories.length > 0 ? (
                                displayedCategories.map((c) => (
                                  <span key={c.id} className={cn("rounded-full border px-1.5 py-0.5 text-micro font-medium", displayCodeBadgeClasses(c.id))}>
                                    {c.name}
                                  </span>
                                ))
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
                          <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                            {formatCurrency(t.amount, { showPositiveSign: true })}
                          </span>
                        </button>
                        {isScanSourced && (
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
        </div>
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
