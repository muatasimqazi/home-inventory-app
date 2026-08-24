"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/components/icon";
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { sortByLabel } from "@/lib/selectors";
import { resolveCategory } from "@/lib/receipt-resolution";
import { useRemountKey } from "@/hooks/use-remount-key";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { Account, CategoryRule, FinanceCategory, Transaction, TransactionType } from "@/lib/types";

const TYPES: { value: TransactionType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "payment", label: "Payment" },
  { value: "refund", label: "Refund" },
];

/** Transfer/payment need two accounts and no category (docs/Personal Finance PRD.md §15 — one transaction, one category only; a transfer/payment is a shuffle between owned accounts, not a categorized expense/income). */
const NEEDS_SECOND_ACCOUNT: TransactionType[] = ["transfer", "payment"];

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

interface TransactionFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: Account[];
  categories: FinanceCategory[];
  /** Powers live category auto-suggestion as the merchant field is typed — see the Merchant input's onChange below. Optional/defaults to empty so any caller that hasn't threaded this through yet still works, just without the suggestion. */
  categoryRules?: CategoryRule[];
  initial?: Transaction;
  /** Pre-selects an account (e.g. opened from an Account Detail page) — ignored when editing. */
  defaultAccountId?: string;
  onSubmitSingle: (values: {
    accountId: string;
    occurredAt: string;
    amount: number;
    type: TransactionType;
    /** First/primary of categoryIds below (or null when nothing's selected) — kept for every existing single-category call site (dashboards, budget math, category_rules, the Ask tool) that only reads Transaction.categoryId and isn't junction-table-aware yet. */
    categoryId: string | null;
    /** Full tag-style category selection (Categories Foundation workstream) — a transaction can carry several, each still representing its full amount, not a split. Selection order is preserved, so categoryIds[0] is always what categoryId above is set to. */
    categoryIds: string[];
    merchant: string | null;
    description: string | null;
    notes: string;
    excludedFromReports: boolean;
    /** True when "Remember this category" was checked — the caller (which owns categoryRules) decides whether that means creating a new rule or replacing a stale one; this form only reports the user's intent. */
    rememberCategory: boolean;
  }) => void;
  onSubmitTransfer: (values: {
    fromAccountId: string;
    toAccountId: string;
    amount: number;
    occurredAt: string;
    type: "transfer" | "payment";
    merchant: string | null;
    description: string | null;
  }) => void;
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
        active ? "bg-yellow text-white" : "bg-surface-muted text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Create/edit sheet for Transaction — used both as a plain expense/income form and, for transfer/payment types, a two-account transfer form (docs/Personal Finance PRD.md §35 "16b · Transaction Form"). */
export function TransactionFormSheet({
  open,
  onOpenChange,
  accounts,
  categories,
  categoryRules = [],
  initial,
  defaultAccountId,
  onSubmitSingle,
  onSubmitTransfer,
}: TransactionFormSheetProps) {
  // Junction-table state (Categories Foundation workstream) — not passed
  // as a prop, read straight from the store like transaction-detail-sheet
  // already does for itemPurchases/transactions, so this sheet's only
  // caller (transactions/page.tsx) doesn't need any new plumbing to
  // support editing an existing transaction's full tag set.
  const transactionCategories = useInventoryStore((s) => s.transactionCategories);
  const createFinanceCategory = useInventoryStore((s) => s.createFinanceCategory);

  const [type, setType] = useState<TransactionType>(initial?.type ?? "expense");
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(initial ? toDateInputValue(initial.occurredAt) : toDateInputValue(new Date().toISOString()));
  const [amount, setAmount] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const amountInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(amountInputRef, [open]);
  // Seeded from transaction_categories when editing (falling back to the
  // legacy single categoryId only if — unexpectedly — no tag rows exist
  // for this transaction yet, e.g. a row from before the backfill ran).
  // Selection order matters: categoryIds[0] is what gets written back as
  // the primary Transaction.categoryId on submit.
  const [categoryIds, setCategoryIds] = useState<string[]>(() => {
    if (!initial) return [];
    const tagged = transactionCategories.filter((tc) => tc.transactionId === initial.id).map((tc) => tc.categoryId);
    if (tagged.length > 0) return tagged;
    return initial.categoryId ? [initial.categoryId] : [];
  });
  const [newCategoryDialogOpen, setNewCategoryDialogOpen] = useState(false);
  const [newCategoryDialogKey, bumpNewCategoryDialogKey] = useRemountKey();
  // Self-healing pruning, adjusted during render rather than in a
  // useEffect (React's documented "adjust state when a prop changes"
  // pattern — same prevOpen-comparison technique add-person-sheet.tsx
  // already uses — since a useEffect+setState here would cost an extra
  // cascading render this codebase's lint config flags): createFinanceCategory()
  // (called from the inline "+ Add new category" dialog below) is
  // optimistic and gives this component no success/failure signal — it
  // just reverts the store's own category list if the insert fails
  // server-side. This prunes any selected id no longer present in
  // `categories` the moment the prop changes — catches that failure case
  // and any other way a selected category could vanish out from under
  // this form (e.g. another member trashing it concurrently via Realtime).
  const [prevCategories, setPrevCategories] = useState(categories);
  if (categories !== prevCategories) {
    setPrevCategories(categories);
    const stillValid = categoryIds.filter((id) => categories.some((c) => c.id === id));
    if (stillValid.length !== categoryIds.length) setCategoryIds(stillValid);
  }
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [excludedFromReports, setExcludedFromReports] = useState(initial?.excludedFromReports ?? false);
  // Defaults on — Receipt Scanning Addendum §5's "user corrects a category
  // during review -> offer 'always categorize [merchant] as [category]'"
  // was speced but never actually wired up for the general transaction
  // form (only the standalone Categories & Rules page could create a
  // rule, and only by typing the merchant out again by hand). Checked by
  // default so picking a category "just works" the way a user would
  // expect, per-transaction opt-out (not a separate required step) keeps
  // it user-correctable rather than silently automated.
  const [rememberCategory, setRememberCategory] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const needsSecondAccount = NEEDS_SECOND_ACCOUNT.includes(type) && !initial;
  const sortedAccounts = sortByLabel(accounts, (a) => a.name);
  const activeCategories = sortByLabel(
    categories.filter((c) => c.status === "active"),
    (c) => c.name
  );

  function handleSubmit() {
    const parsedAmount = Number(amount);
    if (!accountId) {
      setError("Choose an account.");
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    const occurredAtIso = new Date(`${occurredAt}T12:00:00`).toISOString();

    if (needsSecondAccount) {
      if (!toAccountId || toAccountId === accountId) {
        setError("Choose a different destination account.");
        return;
      }
      onSubmitTransfer({
        fromAccountId: accountId,
        toAccountId,
        amount: parsedAmount,
        occurredAt: occurredAtIso,
        type: type as "transfer" | "payment",
        merchant: merchant.trim() || null,
        description: description.trim() || null,
      });
      onOpenChange(false);
      return;
    }

    // A refund is money coming back to you (Discovery Brief groups
    // "Refunds and reimbursements" as an inflow alongside Income) — signed
    // positive, same as income. Only expense stays negative among the
    // remaining single-leg types.
    const signedAmount = type === "income" || type === "refund" ? parsedAmount : -parsedAmount;
    onSubmitSingle({
      accountId,
      occurredAt: occurredAtIso,
      amount: signedAmount,
      type,
      categoryId: categoryIds[0] ?? null,
      categoryIds,
      merchant: merchant.trim() || null,
      description: description.trim() || null,
      notes: notes.trim(),
      excludedFromReports,
      rememberCategory,
    });
    onOpenChange(false);
  }

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{initial ? "Edit Transaction" : "New Transaction"}</SheetTitle>
        </SheetHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6">
          {!initial && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Type</label>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => (
                  <PillButton key={t.value} active={type === t.value} onClick={() => setType(t.value)}>
                    {t.label}
                  </PillButton>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">{needsSecondAccount ? "From account" : "Account"}</label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-11 w-full">
                <SelectValue placeholder="Choose an account" />
              </SelectTrigger>
              <SelectContent>
                {sortedAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsSecondAccount && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">To account</label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {sortedAccounts
                    .filter((a) => a.id !== accountId)
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Amount</label>
            <Input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (error) setError(null);
              }}
              placeholder="$0.00"
              className="h-11"
              inputMode="decimal"
              ref={amountInputRef}
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Date</label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="h-11" />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Merchant</label>
            <Input
              value={merchant}
              onChange={(e) => {
                const nextMerchant = e.target.value;
                setMerchant(nextMerchant);
                // Live rule lookup, not an effect — only fires on the
                // actual keystroke that could change the answer, and only
                // fills in a category the user hasn't already chosen
                // themselves (never overwrites an explicit pick). This is
                // the "future Figma transactions get Technology
                // automatically" loop actually closing for manual entry,
                // not just AI-driven flows that already called
                // resolveCategory() on their own.
                if (categoryIds.length === 0) {
                  const resolved = resolveCategory(nextMerchant, "merchant", categoryRules, categories);
                  if (resolved.source === "rule_match" && resolved.categoryId) setCategoryIds([resolved.categoryId]);
                }
              }}
              placeholder="e.g. Whole Foods"
              className="h-11"
            />
          </div>

          {!needsSecondAccount && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Categories</label>
              {/* Tag-style multi-select (Categories Foundation workstream)
                  — several categories can apply to one transaction, each
                  still representing its full amount, not a split. Toggling
                  a pill preserves selection order, since the first one
                  picked becomes the primary Transaction.categoryId every
                  existing single-category call site reads. */}
              <div className="flex flex-wrap gap-1.5">
                {activeCategories.map((c) => {
                  const active = categoryIds.includes(c.id);
                  return (
                    <PillButton
                      key={c.id}
                      active={active}
                      onClick={() =>
                        setCategoryIds((prev) => (prev.includes(c.id) ? prev.filter((id) => id !== c.id) : [...prev, c.id]))
                      }
                    >
                      {c.name}
                    </PillButton>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    bumpNewCategoryDialogKey();
                    setNewCategoryDialogOpen(true);
                  }}
                  className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-caption font-medium text-muted-foreground"
                >
                  <Icon name="plus" size={12} /> Add new category
                </button>
              </div>
              {categoryIds.length === 0 && <p className="mt-1.5 text-caption text-muted-foreground">Uncategorized</p>}
              {merchant.trim() && categoryIds.length > 0 && (
                <label className="mt-2 flex items-start gap-2 text-caption text-ink">
                  <input type="checkbox" checked={rememberCategory} onChange={(e) => setRememberCategory(e.target.checked)} className="mt-0.5 size-4" />
                  Always categorize &ldquo;{merchant.trim()}&rdquo; as {activeCategories.find((c) => c.id === categoryIds[0])?.name ?? "this"} from now on
                </label>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Description (optional)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-11" />
          </div>

          {!needsSecondAccount && (
            <>
              <div>
                <label className="mb-1 block text-caption text-muted-foreground">Notes (optional)</label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <label className="flex items-center gap-2 text-caption text-ink">
                <input type="checkbox" checked={excludedFromReports} onChange={(e) => setExcludedFromReports(e.target.checked)} className="size-4" />
                Exclude from reports
              </label>
            </>
          )}

          {error && <p className="text-caption text-danger">{error}</p>}

          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    {/* Inline category creation (brief §2) — reuses the exact same
        component + store action finance/categories/page.tsx uses, rather
        than duplicating that logic here. Newly created category is
        appended to the current selection; if it's the very first category
        picked, it becomes the primary Transaction.categoryId automatically
        (categoryIds[0]). */}
    <CategoryFormDialog
      key={newCategoryDialogKey}
      open={newCategoryDialogOpen}
      onOpenChange={setNewCategoryDialogOpen}
      onSubmit={(name) => {
        const created = createFinanceCategory({ name });
        setCategoryIds((prev) => [...prev, created.id]);
        toast.success(`Added ${name}`);
      }}
    />
    </>
  );
}
