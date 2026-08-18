"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Account, FinanceCategory, Transaction, TransactionType } from "@/lib/types";

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
  initial?: Transaction;
  /** Pre-selects an account (e.g. opened from an Account Detail page) — ignored when editing. */
  defaultAccountId?: string;
  onSubmitSingle: (values: {
    accountId: string;
    occurredAt: string;
    amount: number;
    type: TransactionType;
    categoryId: string | null;
    merchant: string | null;
    description: string | null;
    notes: string;
    excludedFromReports: boolean;
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
  initial,
  defaultAccountId,
  onSubmitSingle,
  onSubmitTransfer,
}: TransactionFormSheetProps) {
  const [type, setType] = useState<TransactionType>(initial?.type ?? "expense");
  const [accountId, setAccountId] = useState(initial?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(accounts.find((a) => a.id !== accountId)?.id ?? "");
  const [occurredAt, setOccurredAt] = useState(initial ? toDateInputValue(initial.occurredAt) : toDateInputValue(new Date().toISOString()));
  const [amount, setAmount] = useState(initial ? String(Math.abs(initial.amount)) : "");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [excludedFromReports, setExcludedFromReports] = useState(initial?.excludedFromReports ?? false);
  const [error, setError] = useState<string | null>(null);

  const needsSecondAccount = NEEDS_SECOND_ACCOUNT.includes(type) && !initial;
  const activeCategories = categories.filter((c) => c.status === "active");

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

    // expense/refund store a negative signed amount, income a positive one.
    const signedAmount = type === "income" ? parsedAmount : -parsedAmount;
    onSubmitSingle({
      accountId,
      occurredAt: occurredAtIso,
      amount: signedAmount,
      type,
      categoryId: categoryId || null,
      merchant: merchant.trim() || null,
      description: description.trim() || null,
      notes: notes.trim(),
      excludedFromReports,
    });
    onOpenChange(false);
  }

  return (
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
                {accounts.map((a) => (
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
                  {accounts
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
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Date</label>
            <Input type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} className="h-11" />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Merchant</label>
            <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="e.g. Whole Foods" className="h-11" />
          </div>

          {!needsSecondAccount && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Category</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
  );
}
