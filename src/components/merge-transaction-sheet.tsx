"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatShortDate, parseCalendarDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, Transaction } from "@/lib/types";

const CANDIDATE_WINDOW_DAYS = 7;

/**
 * Duplicate-transaction prevention, part E — the manual fallback for two
 * transactions that already exist as separate rows for the same real
 * charge (an older duplicate, or a case the automated checks in the
 * receipt-review flow still miss). No AI here on purpose: this is
 * already the "a person is deliberately browsing" path, a plain sorted
 * list is enough — the AI fallback (part B) is specifically for the
 * unattended/automated check, not this one.
 */
export function MergeTransactionSheet({
  open,
  onOpenChange,
  transaction,
  accounts,
  allTransactions,
  onMerge,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction;
  accounts: Account[];
  allTransactions: Transaction[];
  onMerge: (keepId: string, discardId: string) => Promise<void>;
}) {
  const [picked, setPicked] = useState<Transaction | null>(null);

  const txnDate = parseCalendarDate(transaction.occurredAt);
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  const candidates = allTransactions
    .filter((t) => t.id !== transaction.id && !t.trashedAt && !t.linkedTransactionId)
    .filter((t) => Math.abs(parseCalendarDate(t.occurredAt).getTime() - txnDate.getTime()) / (1000 * 60 * 60 * 24) <= CANDIDATE_WINDOW_DAYS)
    .sort((a, b) => {
      const amountDiff = Math.abs(Math.abs(a.amount) - Math.abs(transaction.amount)) - Math.abs(Math.abs(b.amount) - Math.abs(transaction.amount));
      if (amountDiff !== 0) return amountDiff;
      const dateDiff =
        Math.abs(parseCalendarDate(a.occurredAt).getTime() - txnDate.getTime()) -
        Math.abs(parseCalendarDate(b.occurredAt).getTime() - txnDate.getTime());
      if (dateDiff !== 0) return dateDiff;
      const sameAccountA = a.accountId === transaction.accountId ? 0 : 1;
      const sameAccountB = b.accountId === transaction.accountId ? 0 : 1;
      return sameAccountA - sameAccountB;
    });

  // Prefer keeping whichever side is NOT the Plaid-sourced one — same
  // convention the automated adoption path (plaid/sync.ts's handleAdded)
  // already establishes for the exact-match case, so this reads as one
  // consistent survivorship model across the whole feature rather than
  // two different rules depending on which path caught the duplicate.
  // Falls back to keeping the transaction already open in this drawer
  // when neither/both sides are Plaid-sourced.
  const keepId = picked && transaction.source === "plaid" && picked.source !== "plaid" ? picked.id : transaction.id;
  const discardId = picked ? (keepId === transaction.id ? picked.id : transaction.id) : null;
  const keepTxn = picked ? (keepId === transaction.id ? transaction : picked) : null;
  const discardTxn = picked ? (discardId === transaction.id ? transaction : picked) : null;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Merge with another transaction</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <p className="text-caption text-muted-foreground">
              Within a week of {formatShortDate(transaction.occurredAt)}. Closest amount/date matches are listed first, including bank-synced duplicates from another visible account.
            </p>
            {candidates.length === 0 ? (
              <EmptyState icon="receipt" title="Nothing nearby" description="No other visible transactions within a week of this one." />
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
                {candidates.map((t) => {
                  const candidateAccount = accountById.get(t.accountId);
                  return (
                    <button key={t.id} type="button" onClick={() => setPicked(t)} className="flex items-center gap-3 px-3 py-2.5 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                        <p className="truncate text-micro text-muted-foreground">
                          {formatShortDate(t.occurredAt)} · {t.source === "plaid" ? "Bank Sync" : t.source === "receipt_scan" ? "Receipt Scan" : t.source === "csv_import" ? "CSV Import" : "Manual"}
                          {candidateAccount ? ` · ${candidateAccount.name}` : ""}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-caption font-medium", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                        {formatCurrency(t.amount, { showPositiveSign: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!picked}
        onOpenChange={(open) => !open && setPicked(null)}
        title="Merge these transactions?"
        description={
          keepTxn && discardTxn
            ? `Keeps "${keepTxn.merchant ?? keepTxn.description ?? "this transaction"}" (${formatCurrency(keepTxn.amount, { showPositiveSign: true })}) — its receipt details, attachments, and linked items move over from the other one, which gets trashed.`
            : ""
        }
        confirmLabel="Merge"
        icon="link"
        onConfirm={async () => {
          if (!keepId || !discardId) return;
          await onMerge(keepId, discardId);
          onOpenChange(false); // closes the picker sheet itself, not just this confirm dialog (ConfirmDialog closes its own on success)
        }}
      />
    </>
  );
}
