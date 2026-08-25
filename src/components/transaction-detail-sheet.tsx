"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { LineItemFormSheet } from "@/components/line-item-form-sheet";
import { MerchantIcon } from "@/components/merchant-icon";
import { LinkPurchaseSheet } from "@/components/link-purchase-sheet";
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
import { useInventoryStore } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { categoriesForTransaction } from "@/lib/selectors";
import type { Account, ScannedReceiptLineItem, Transaction, TransactionAttachment } from "@/lib/types";

interface TransactionDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction: Transaction | null;
  account: Account | undefined;
  /** Present when this transaction has a permanently-retained receipt image (Receipt Scanning Addendum §6). */
  attachment: TransactionAttachment | undefined;
  onEdit: () => void;
  onTrash: () => void;
}

const SOURCE_LABEL: Record<Transaction["source"], string> = {
  manual: "Manual",
  csv_import: "CSV Import",
  receipt_scan: "Receipt Scan",
  plaid: "Bank Sync",
};

/** Right-side drawer, not a route — docs/Personal Finance PRD.md §35: "Transactions list (+ add/edit form) ... list; detail opens as a drawer, not a route." */
export function TransactionDetailSheet({ open, onOpenChange, transaction, account, attachment, onEdit, onTrash }: TransactionDetailSheetProps) {
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<ScannedReceiptLineItem[]>([]);
  const [editingLineItem, setEditingLineItem] = useState<ScannedReceiptLineItem | null>(null);
  const [deleteLineItemConfirm, setDeleteLineItemConfirm] = useState<ScannedReceiptLineItem | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [linkItemOpen, setLinkItemOpen] = useState(false);

  // Reaches into the store directly (not threaded down as props from
  // transactions/page.tsx) for the same reason this component already
  // does its own Supabase fetches above — it's not a fully "pure props"
  // component to begin with, and selecting the household's transactions
  // here (for refund-transaction options) is cheap vs. prop-drilling
  // through the one real caller.
  const allTransactions = useInventoryStore((s) => s.transactions);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const items = useInventoryStore((s) => s.items);
  const itemPurchases = useInventoryStore((s) => s.itemPurchases);
  const linkItemPurchase = useInventoryStore((s) => s.linkItemPurchase);
  const unlinkItemPurchase = useInventoryStore((s) => s.unlinkItemPurchase);
  // Tag-style multi-category links (Categories Foundation workstream) —
  // combined with financeCategories below via the shared
  // categoriesForTransaction() selector to get this transaction's full
  // display set (falls back to its single legacy categoryId internally,
  // so this component no longer needs a separate `category` prop from
  // its caller for that).
  const transactionCategoryLinks = useInventoryStore((s) => s.transactionCategories);
  const financeCategories = useInventoryStore((s) => s.financeCategories);

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

  async function handleDeleteLineItem() {
    if (!deleteLineItemConfirm) return;
    const result = await deleteScannedReceiptLineItem(deleteLineItemConfirm.id);
    if (!result.ok) {
      toast.error(`Couldn't delete: ${result.error}`);
      return;
    }
    setLineItems((prev) => prev.filter((li) => li.id !== deleteLineItemConfirm.id));
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
    if (!transaction) return;
    const result = await createManualLineItem(currentHouseholdId, transaction.id, values);
    if (!result.ok) {
      toast.error(`Couldn't add item: ${result.error}`);
      return;
    }
    setLineItems((prev) => [...prev, result.item]);
    toast.success("Item added");
  }

  async function handlePickItemToLink(result: { id: string; suggested: boolean }) {
    if (!transaction) return;
    const res = await linkItemPurchase({ itemId: result.id, transactionId: transaction.id, source: result.suggested ? "ai_suggested" : "manual" });
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't link that item.");
      return;
    }
    toast.success("Item linked");
  }

  function handleUnlinkItem(purchaseId: string) {
    unlinkItemPurchase(purchaseId);
    toast("Link removed");
  }

  if (!transaction) return null;

  // PRD §25's linking is transaction ↔ item, so this drawer only needs
  // links keyed off transactionId — a link still mid-review (only
  // scannedReceiptLineItemId set, no transactionId yet) belongs to Receipt
  // Review's own "Link to item" affordance, not this one.
  const linkedPurchases = itemPurchases.filter((p) => p.transactionId === transaction.id);

  // Full tag-style category set for this transaction — shared with the
  // transactions list and the edit form (lib/selectors.ts) so all three
  // can't drift on what "this transaction's categories" means.
  const displayedCategories = categoriesForTransaction(
    transaction,
    transactionCategoryLinks.filter((tc) => tc.transactionId === transaction.id).map((tc) => tc.categoryId),
    financeCategories
  );

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
          <div className="flex items-center gap-2.5">
            <MerchantIcon logoUrl={transaction.merchantLogoUrl} merchantName={transaction.merchant ?? transaction.description} className="size-10 text-body" />
            <SheetTitle className="min-w-0 truncate text-section-title font-medium text-ink">{transaction.merchant ?? transaction.description ?? "Transaction"}</SheetTitle>
          </div>
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
              <p className="text-caption text-muted-foreground">{displayedCategories.length > 1 ? "Categories" : "Category"}</p>
              {displayedCategories.length === 0 ? (
                <p className="text-body font-medium text-ink">Uncategorized</p>
              ) : (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {displayedCategories.map((c) => (
                    <span key={c.id} className={cn("rounded-full border px-1.5 py-0.5 text-micro font-medium", displayCodeBadgeClasses(c.id))}>
                      {c.name}
                    </span>
                  ))}
                </div>
              )}
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
            <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
              <Icon name="eyeOff" size={14} className="shrink-0" aria-hidden />
              Excluded from reports.
            </p>
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

          {transaction.source === "receipt_scan" && (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-caption text-muted-foreground">{lineItems.length > 0 ? `Items (${lineItems.length})` : "Items"}</p>
                <button type="button" onClick={() => setAddingItem(true)} className="flex items-center gap-1 text-caption font-medium text-yellow-text">
                  <Icon name="plus" size={13} /> Add Item
                </button>
              </div>
              {lineItems.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">
                  No items recorded for this receipt yet.
                </p>
              ) : (
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
              )}
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-caption text-muted-foreground">
                {linkedPurchases.length > 0 ? `Linked items (${linkedPurchases.length})` : "Linked items"}
              </p>
              <button type="button" onClick={() => setLinkItemOpen(true)} className="flex items-center gap-1 text-caption font-medium text-yellow-text">
                <Icon name="link" size={13} /> Link to item
              </button>
            </div>
            {linkedPurchases.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">
                Not linked to anything in your inventory yet.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
                {linkedPurchases.map((purchase) => {
                  const linkedItem = items.find((it) => it.id === purchase.itemId);
                  return (
                    <div key={purchase.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-caption font-medium text-ink">{linkedItem?.name ?? "Deleted item"}</p>
                        {linkedItem && <p className="truncate text-micro text-muted-foreground">{linkedItem.category}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnlinkItem(purchase.id)}
                        aria-label="Remove link"
                        className="tap-target flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-danger"
                      >
                        <Icon name="close" size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

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

    <LinkPurchaseSheet
      open={linkItemOpen}
      onOpenChange={setLinkItemOpen}
      mode="item"
      referenceDate={transaction.occurredAt}
      excludeIds={linkedPurchases.map((p) => p.itemId)}
      onPick={handlePickItemToLink}
    />

    <LineItemFormSheet
      // Same always-mounted-with-open-prop pattern as the transactions list
      // page's copy of this sheet — key on the target item/transaction so
      // the form remounts and reseeds instead of reusing stale state from
      // whichever item was edited/added first in this drawer's lifetime.
      key={editingLineItem?.id ?? (addingItem ? transaction.id : "none")}
      open={!!editingLineItem || addingItem}
      onOpenChange={(open) => {
        if (!open) {
          setEditingLineItem(null);
          setAddingItem(false);
        }
      }}
      lineItem={editingLineItem}
      createForTransactionId={addingItem ? transaction.id : null}
      onSubmit={handleSaveLineItem}
      onCreate={handleCreateLineItem}
      refundOptions={refundOptions}
      refundTransaction={linkedRefundTxn}
      onCreateAndLinkRefund={handleCreateAndLinkRefund}
      onLinkExistingRefund={handleLinkExistingRefund}
      onUndoReturn={handleUndoReturn}
      onRequestDelete={() => setDeleteLineItemConfirm(editingLineItem)}
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
    </>
  );
}
