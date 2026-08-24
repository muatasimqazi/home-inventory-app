"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/components/icon";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { ScannedReceiptLineItem, Transaction } from "@/lib/types";

interface LineItemFormValues {
  standardName: string;
  brand: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
}

interface LineItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing item. Set this XOR `createForTransactionId` — the caller closes one before opening the other, never both at once. */
  lineItem: ScannedReceiptLineItem | null;
  /** Adding a brand-new item straight onto an already-confirmed transaction (0013_manual_line_items.sql) — no draft/AI extraction involved. */
  createForTransactionId: string | null;
  onSubmit: (patch: LineItemFormValues) => void;
  onCreate: (values: LineItemFormValues) => void;
  /** Existing refund-type transactions on that same account, most recent first — offered as "link instead of creating a new one." Irrelevant in create mode. */
  refundOptions: Transaction[];
  /** The refund transaction this item is currently linked to, if any (drives the "already returned" display). Irrelevant in create mode. */
  refundTransaction: Transaction | null;
  onCreateAndLinkRefund: (values: { amount: number; occurredAt: string }) => void;
  onLinkExistingRefund: (refundTransactionId: string, refundedAmountCents: number) => void;
  onUndoReturn: () => void;
  /** Just requests confirmation — the parent owns the actual delete + its own ConfirmDialog, same pattern as TransactionDetailSheet's onTrash. Irrelevant in create mode — a not-yet-saved item has nothing to delete. */
  onRequestDelete: () => void;
}

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}

function inputToCents(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Edits an existing receipt line item, or (createForTransactionId set
 * instead of lineItem) adds a brand-new one straight onto an already-
 * confirmed transaction — reachable both from the Transactions list's
 * nested items and from TransactionDetailSheet's item list (see
 * lib/receipt-line-items.ts, the shared write path both use). Create mode
 * exists because a receipt scan can legitimately extract a transaction's
 * totals correctly while returning zero line items (a real one did — see
 * draftNeedsReview's "No items could be identified" reason) — without it,
 * the only way to add the missing itemization was a full re-scan.
 *
 * "Returned" is a real linked refund transaction (0012_line_item_returns.sql,
 * decided directly rather than assumed: a return is a separate dated money
 * event, sometimes a different amount than the original price due to a
 * restocking fee — not a silent rewrite of the original purchase). Two
 * ways to link one: record a brand-new refund transaction right here, or
 * point at one that was already entered. Deliberately its own section
 * with its own confirm action, not folded into the name/brand/qty/price
 * Save button above — editing an item's description and recording a real
 * money movement are different kinds of actions. Not shown in create mode
 * — a not-yet-saved item can't be returned or deleted yet.
 *
 * Fields are seeded via lazy useState initializers, not a reseed effect.
 * The fresh-per-item read actually comes from *this file's own*
 * `if (!lineItem && !createForTransactionId) return null` guard below —
 * not from Radix (SheetContent unmounting its portal content while
 * closed says nothing about whether this outer component, which owns the
 * hooks, is mounted). When a caller clears both props to null/false on
 * close, this wrapper renders null, genuinely unmounting
 * LineItemFormSheetInner; reopening for a different item is then a real
 * first mount with fresh props. Both call sites also now pass an explicit
 * `key` on top of this as a second, more direct guarantee — see
 * TransactionFormSheet, which lacked any equivalent guard and was
 * shipping stale/blank fields on every edit after the first as a result.
 */
export function LineItemFormSheet({ lineItem, createForTransactionId, onOpenChange, ...rest }: LineItemFormSheetProps) {
  if (!lineItem && !createForTransactionId) return null;
  return <LineItemFormSheetInner lineItem={lineItem} onOpenChange={onOpenChange} {...rest} />;
}

function LineItemFormSheetInner({
  open,
  onOpenChange,
  lineItem,
  onSubmit,
  onCreate,
  refundOptions,
  refundTransaction,
  onCreateAndLinkRefund,
  onLinkExistingRefund,
  onUndoReturn,
  onRequestDelete,
}: Omit<LineItemFormSheetProps, "createForTransactionId">) {
  const isCreate = !lineItem;
  const [standardName, setStandardName] = useState(lineItem ? (lineItem.standardName ?? lineItem.rawItem) : "");
  const standardNameInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(standardNameInputRef);
  const [brand, setBrand] = useState(lineItem?.brand ?? "");
  const [quantity, setQuantity] = useState(lineItem ? String(lineItem.quantity) : "1");
  const [unitPrice, setUnitPrice] = useState(lineItem ? centsToInput(lineItem.unitPriceCents) : "");
  const [lineTotal, setLineTotal] = useState(lineItem ? centsToInput(lineItem.lineTotalCents) : "");
  const [error, setError] = useState<string | null>(null);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnMode, setReturnMode] = useState<"new" | "existing">("new");
  const [refundAmount, setRefundAmount] = useState(lineItem ? centsToInput(lineItem.lineTotalCents) : "");
  const [refundDate, setRefundDate] = useState(todayInputValue());
  const [existingRefundId, setExistingRefundId] = useState(refundOptions[0]?.id ?? "");
  const [existingRefundShare, setExistingRefundShare] = useState(refundOptions[0] ? String(Math.abs(refundOptions[0].amount)) : "");
  const [returnError, setReturnError] = useState<string | null>(null);

  function handleSubmit() {
    const parsedQuantity = Number(quantity);
    if (!standardName.trim()) {
      setError("Item name is required.");
      return;
    }
    if (!quantity || Number.isNaN(parsedQuantity) || parsedQuantity <= 0) {
      setError("Enter a quantity greater than 0.");
      return;
    }
    const values: LineItemFormValues = {
      standardName: standardName.trim(),
      brand: brand.trim() || null,
      quantity: parsedQuantity,
      unitPriceCents: inputToCents(unitPrice),
      lineTotalCents: inputToCents(lineTotal),
    };
    if (isCreate) onCreate(values);
    else onSubmit(values);
    onOpenChange(false);
  }

  function handleConfirmReturn() {
    if (returnMode === "new") {
      const amount = Number(refundAmount);
      if (!refundAmount || Number.isNaN(amount) || amount <= 0) {
        setReturnError("Enter a refund amount greater than 0.");
        return;
      }
      onCreateAndLinkRefund({ amount, occurredAt: new Date(`${refundDate}T12:00:00`).toISOString() });
    } else {
      const share = Number(existingRefundShare);
      if (!existingRefundId) {
        setReturnError("Choose which refund this item was part of.");
        return;
      }
      if (!existingRefundShare || Number.isNaN(share) || share <= 0) {
        setReturnError("Enter this item's share of the refund.");
        return;
      }
      onLinkExistingRefund(existingRefundId, Math.round(share * 100));
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{isCreate ? "Add Item" : "Edit Item"}</SheetTitle>
        </SheetHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6">
          {lineItem && lineItem.rawItem && lineItem.rawItem !== standardName && (
            <p className="text-caption text-muted-foreground">Originally captured as &ldquo;{lineItem.rawItem}&rdquo;.</p>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Item name</label>
            <Input
              value={standardName}
              onChange={(e) => {
                setStandardName(e.target.value);
                if (error) setError(null);
              }}
              className="h-11"
              ref={standardNameInputRef}
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Brand (optional)</label>
            <Input value={brand} onChange={(e) => setBrand(e.target.value)} className="h-11" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Qty</label>
              <Input
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  if (error) setError(null);
                }}
                inputMode="decimal"
                className="h-11"
              />
            </div>
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Unit price</label>
              <Input value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} placeholder="$0.00" inputMode="decimal" className="h-11" />
            </div>
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Line total</label>
              <Input value={lineTotal} onChange={(e) => setLineTotal(e.target.value)} placeholder="$0.00" inputMode="decimal" className="h-11" />
            </div>
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}

          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSubmit}>
            {isCreate ? "Add Item" : "Save"}
          </Button>

          {!isCreate && lineItem && (
          <div className="border-t border-border pt-4">
            {refundTransaction ? (
              <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface-muted p-3">
                <div className="flex items-center gap-1.5">
                  <Icon name="repeat" size={14} className="text-badge-green-text" />
                  <p className="text-caption font-semibold text-ink">Returned</p>
                </div>
                <p className="text-caption text-muted-foreground">
                  Refunded {formatCurrency(Math.abs(lineItem.refundedAmountCents ?? 0) / 100)} via {refundTransaction.merchant ?? "a refund"} on{" "}
                  {formatShortDate(refundTransaction.occurredAt)}.
                </p>
                <Button variant="outline" size="sm" onClick={onUndoReturn}>
                  Undo Return
                </Button>
              </div>
            ) : !showReturnForm ? (
              <Button variant="outline" className="w-full" onClick={() => setShowReturnForm(true)}>
                <Icon name="repeat" size={16} /> Mark as Returned
              </Button>
            ) : (
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-muted p-3">
                <p className="text-caption font-semibold text-ink">Mark as Returned</p>

                {refundOptions.length > 0 && (
                  <div className="flex gap-0.5 rounded-lg bg-white p-0.75">
                    <button
                      type="button"
                      onClick={() => setReturnMode("new")}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-caption font-semibold transition-colors",
                        returnMode === "new" ? "bg-ink text-white" : "text-muted-foreground"
                      )}
                    >
                      New refund
                    </button>
                    <button
                      type="button"
                      onClick={() => setReturnMode("existing")}
                      className={cn(
                        "flex-1 rounded-md py-1.5 text-caption font-semibold transition-colors",
                        returnMode === "existing" ? "bg-ink text-white" : "text-muted-foreground"
                      )}
                    >
                      Link existing
                    </button>
                  </div>
                )}

                {returnMode === "new" || refundOptions.length === 0 ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-caption text-muted-foreground">Refund amount</label>
                      <Input
                        value={refundAmount}
                        onChange={(e) => {
                          setRefundAmount(e.target.value);
                          if (returnError) setReturnError(null);
                        }}
                        placeholder="$0.00"
                        inputMode="decimal"
                        className="h-11 bg-white"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-caption text-muted-foreground">Date</label>
                      <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} className="h-11 bg-white" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-caption text-muted-foreground">Which refund?</label>
                      <Select
                        value={existingRefundId}
                        onValueChange={(value) => {
                          setExistingRefundId(value);
                          const picked = refundOptions.find((t) => t.id === value);
                          if (picked) setExistingRefundShare(String(Math.abs(picked.amount)));
                          if (returnError) setReturnError(null);
                        }}
                      >
                        <SelectTrigger className="h-11 w-full bg-white">
                          <SelectValue placeholder="Choose a refund transaction" />
                        </SelectTrigger>
                        <SelectContent>
                          {refundOptions.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.merchant ?? "Refund"} · {formatShortDate(t.occurredAt)} · {formatCurrency(t.amount, { showPositiveSign: true })}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-caption text-muted-foreground">This item&apos;s share</label>
                      <Input
                        value={existingRefundShare}
                        onChange={(e) => {
                          setExistingRefundShare(e.target.value);
                          if (returnError) setReturnError(null);
                        }}
                        placeholder="$0.00"
                        inputMode="decimal"
                        className="h-11 bg-white"
                      />
                    </div>
                  </>
                )}

                {returnError && <p className="text-caption text-danger">{returnError}</p>}

                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setShowReturnForm(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={handleConfirmReturn}>
                    Confirm Return
                  </Button>
                </div>
              </div>
            )}
          </div>
          )}

          {!isCreate && (
            <Button variant="outline" className="border-danger/30 text-danger" onClick={onRequestDelete}>
              <Icon name="trash" size={16} /> Delete Item
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
