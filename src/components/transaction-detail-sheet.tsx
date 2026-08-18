"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { LineItemFormSheet } from "@/components/line-item-form-sheet";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToScannedReceiptLineItem, type ScannedReceiptLineItemRow } from "@/lib/supabase/mappers";
import { updateScannedReceiptLineItem, linkLineItemRefund, unlinkLineItemRefund } from "@/lib/receipt-line-items";
import { createAndLinkRefundTransaction } from "@/lib/receipt-refunds";
import { useInventoryStore } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, FinanceCategory, ScannedReceiptLineItem, Transaction, TransactionAttachment } from "@/lib/types";

interface TransactionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  account: Account | undefined;
  category: FinanceCategory | undefined;
  /** Present when this transaction has a permanently-retained receipt image (Receipt Scanning Addendum §6). */
  attachment: TransactionAttachment | undefined;
  onEdit: () => void;
  onTrash: () => void;
}

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  manual: "Manual",
  csv_import: "CSV Import",
  receipt_scan: "Receipt Scan",
};

/** Right-side drawer, not a route — docs/Personal Finance PRD.md §35: "Transactions list (+ add/edit form) ... list; detail opens as a drawer, not a route." */
export function TransactionDetailSheet({ open, onOpenChange, transaction, account, category, attachment, onEdit, onTrash }: TransactionDetailSheetProps) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<ScannedReceiptLineItem[]>([]);
  const [editingLineItem, setEditingLineItem] = useState<ScannedReceiptLineItem | null>(null);

  // Reaches into the store directly (not threaded down as props from
  // transactions/page.tsx) for the same reason this component already
  // does its own Supabase fetches above — it's not a fully "pure props"
  // component to begin with, and selecting the household's transactions
  // here (for refund-transaction options) is cheap vs. prop-drilling
  // through the one real caller.
  const allTransactions = useInventoryStore((s) => s.transactions);

  // Both fetched on demand, not kept in the global store: a signed URL is
  // deliberately short-lived (private bucket, same pattern
  // item-attachments.tsx already uses), and scanned_receipt_line_items —
  // while permanent, queryable structure per the Addendum — is detail
  // only this one drawer needs, not something every transaction-list
  // render should carry.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || !attachment) {
        if (!cancelled) setReceiptUrl(null);
        return;
      }
      const { data } = await getSupabaseBrowserClient().storage.from("attachments").createSignedUrl(attachment.storagePath, 300);
      if (!cancelled) setReceiptUrl(data?.signedUrl ?? null);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [open, attachment]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!open || !transaction || transaction.source !== "receipt_scan") {
        if (!cancelled) setLineItems([]);
        return;
      }
      const { data } = await getSupabaseBrowserClient().from("scanned_receipt_line_items").select("*").eq("transaction_id", transaction.id);
      if (!cancelled) setLineItems(((data ?? []) as ScannedReceiptLineItemRow[]).map(rowToScannedReceiptLineItem));
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [open, transaction]);

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
    setLineItems((prev) => prev.map((li) => (li.id === result.item.id ? result.item : li)));
    toast.success("Item updated");
  }

  // Doesn't also setEditingLineItem(updated) — the confirm-return flow
  // closes the sheet right after, which already nulls editingLineItem via
  // onOpenChange; see the identical comment on the Transactions list's own
  // copy of this pattern.
  function patchLineItemInList(updated: ScannedReceiptLineItem) {
    setLineItems((prev) => prev.map((li) => (li.id === updated.id ? updated : li)));
  }

  async function handleCreateAndLinkRefund(values: { amount: number; occurredAt: string }) {
    if (!editingLineItem || !transaction) return;
    const result = await createAndLinkRefundTransaction(editingLineItem, {
      accountId: transaction.accountId,
      occurredAt: values.occurredAt,
      amount: values.amount,
      merchant: transaction.merchant,
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

  if (!transaction) return null;

  const refundOptions = allTransactions
    .filter((t) => t.type === "refund" && !t.trashedAt && t.accountId === transaction.accountId)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const linkedRefundTxn = editingLineItem?.refundTransactionId
    ? (allTransactions.find((t) => t.id === editingLineItem.refundTransactionId) ?? null)
    : null;

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{transaction.merchant ?? transaction.description ?? "Transaction"}</SheetTitle>
        </SheetHeader>
        {/* SheetContent for side="right"/"left" is a fixed h-full flex
            column (see components/ui/sheet.tsx) — unlike bottom sheets,
            nothing bounds this div's height by default, so it silently
            clips instead of scrolling once content (now: line items,
            receipt image, edit affordances) exceeds the viewport.
            flex-1 min-h-0 lets it actually take the remaining height
            below SheetHeader (a flex sibling), overflow-y-auto makes
            that remainder scroll — same fix every bottom-sheet consumer
            in this codebase already applies to its own body div. */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
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

          {receiptUrl && (
            <div>
              <p className="mb-1.5 text-caption text-muted-foreground">Receipt</p>
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptUrl} alt="Scanned receipt" className="max-h-64 w-full object-cover" />
              </a>
            </div>
          )}

          {lineItems.length > 0 && (
            <div>
              <p className="mb-1.5 text-caption text-muted-foreground">Items ({lineItems.length})</p>
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
                {lineItems.map((li) => (
                  <button key={li.id} type="button" onClick={() => setEditingLineItem(li)} className="flex items-center gap-3 px-3 py-2.5 text-left">
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
                    <span className={cn("shrink-0 text-caption font-medium", li.refundTransactionId ? "text-muted-foreground line-through" : "text-ink")}>
                      {li.lineTotalCents !== null ? formatCurrency(li.lineTotalCents / 100) : "—"}
                    </span>
                    <Icon name="edit" size={13} className="shrink-0 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
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

    <LineItemFormSheet
      open={!!editingLineItem}
      onOpenChange={(open) => !open && setEditingLineItem(null)}
      lineItem={editingLineItem}
      onSubmit={handleSaveLineItem}
      refundOptions={refundOptions}
      refundTransaction={linkedRefundTxn}
      onCreateAndLinkRefund={handleCreateAndLinkRefund}
      onLinkExistingRefund={handleLinkExistingRefund}
      onUndoReturn={handleUndoReturn}
    />
    </>
  );
}
