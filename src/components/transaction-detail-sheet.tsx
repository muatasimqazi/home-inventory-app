"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, FinanceCategory, Transaction } from "@/lib/types";

interface TransactionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  account: Account | undefined;
  category: FinanceCategory | undefined;
  onEdit: () => void;
  onTrash: () => void;
}

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  manual: "Manual",
  csv_import: "CSV Import",
  receipt_scan: "Receipt Scan",
};

/** Right-side drawer, not a route — docs/Personal Finance PRD.md §35: "Transactions list (+ add/edit form) ... list; detail opens as a drawer, not a route." */
export function TransactionDetailSheet({ open, onOpenChange, transaction, account, category, onEdit, onTrash }: TransactionDetailSheetProps) {
  if (!transaction) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{transaction.merchant ?? transaction.description ?? "Transaction"}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <p className={cn("text-3xl font-semibold", transaction.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
            {formatCurrency(transaction.amount, { showPositiveSign: true })}
          </p>

          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-border bg-white p-4">
            <div>
              <p className="text-caption text-muted-foreground">Date</p>
              <p className="text-body font-medium text-ink">{formatDate(transaction.occurredAt)}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Status</p>
              <p className="text-body font-medium text-ink">{transaction.status === "pending" ? "Pending" : "Posted"}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Account</p>
              <p className="text-body font-medium text-ink">{account?.name ?? "—"}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Category</p>
              <p className="text-body font-medium text-ink">{category?.name ?? "Uncategorized"}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Source</p>
              <p className="text-body font-medium text-ink">{SOURCE_LABEL[transaction.source]}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Type</p>
              <p className="text-body font-medium text-ink capitalize">{transaction.type}</p>
            </div>
          </div>

          {transaction.description && (
            <div>
              <p className="text-caption text-muted-foreground">Description</p>
              <p className="text-body text-ink">{transaction.description}</p>
            </div>
          )}
          {transaction.notes && (
            <div>
              <p className="text-caption text-muted-foreground">Notes</p>
              <p className="text-body text-ink">{transaction.notes}</p>
            </div>
          )}
          {transaction.excludedFromReports && (
            <p className="text-caption text-muted-foreground">Excluded from reports.</p>
          )}
          {transaction.linkedTransactionId && (
            <p className="text-caption text-muted-foreground">Linked to another leg of a transfer/payment.</p>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <Icon name="edit" size={16} /> Edit
            </Button>
            <Button variant="outline" className="flex-1 border-danger/30 text-danger" onClick={onTrash}>
              <Icon name="trash" size={16} /> Trash
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
