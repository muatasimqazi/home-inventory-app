"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/components/icon";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScannedReceiptLineItem, Transaction } from "@/lib/types";

interface LineItemFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lineItem: ScannedReceiptLineItem | null;
  onSubmit: (patch: {
    standardName: string | null;
    brand: string | null;
    quantity: number;
    unitPriceCents: number | null;
    lineTotalCents: number | null;
  }) => void;
  /** Existing refund-type transactions on that same account, most recent first — offered as "link instead of creating a new one." */
  refundOptions: Transaction[];
  /** The refund transaction this item is currently linked to, if any (drives the "already returned" display). */
  refundTransaction: Transaction | null;
  onCreateAndLinkRefund: (values: { amount: number; occurredAt: string }) => void;
  onLinkExistingRefund: (refundTransactionId: string, refundedAmountCents: number) => void;
  onUndoReturn: () => void;
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
 * Edits one already-persisted receipt line item, and separately handles
 * marking it returned/refunded — reachable both from the Transactions
 * list's nested items and from TransactionDetailSheet's item list (see
 * lib/receipt-line-items.ts, the shared write path both use).
 *
 * "Returned" is a real linked refund transaction (0012_line_item_returns.sql,
 * decided directly rather than assumed: a return is a separate dated money
 * event, sometimes a different amount than the original price due to a
 * restocking fee — not a silent rewrite of the original purchase). Two
 * ways to link one: record a brand-new refund transaction right here, or
 * point at one that was already entered. Deliberately its own section
 * with its own confirm action, not folded into the name/brand/qty/price
 * Save button above — editing an item's description and recording a real
 * money movement are different kinds of actions.
 *
 * Fields are seeded via lazy useState initializers, not a reseed effect —
 * matching TransactionFormSheet's own convention. Radix's SheetContent
 * unmounts its children when `open` goes false (no forceMount here), so a
 * fresh instance — and fresh initializer read of whatever `lineItem` is
 * current at that moment — is created each time the sheet reopens for a
 * different item. Relies on the caller fully closing before reopening for
 * a different item, which is how both call sites already work.
 */
export function LineItemFormSheet({ lineItem, onOpenChange, ...rest }: LineItemFormSheetProps) {
  if (!lineItem) return null;
  return <LineItemFormSheetInner lineItem={lineItem} onOpenChange={onOpenChange} {...rest} />;
}

function LineItemFormSheetInner({
  open,
  onOpenChange,
  lineItem,
  onSubmit,
  refundOptions,
  refundTransaction,
  onCreateAndLinkRefund,
  onLinkExistingRefund,
  onUndoReturn,
}: LineItemFormSheetProps & { lineItem: ScannedReceiptLineItem }) {
  const [standardName, setStandardName] = useState(lineItem.standardName ?? lineItem.rawItem);
  const [brand, setBrand] = useState(lineItem.brand ?? "");
  const [quantity, setQuantity] = useState(String(lineItem.quantity));
  const [unitPrice, setUnitPrice] = useState(centsToInput(lineItem.unitPriceCents));
  const [lineTotal, setLineTotal] = useState(centsToInput(lineItem.lineTotalCents));
  const [error, setError] = useState<string | null>(null);

  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnMode, setReturnMode] = useState<"new" | "existing">("new");
  const [refundAmount, setRefundAmount] = useState(centsToInput(lineItem.lineTotalCents));
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
    onSubmit({
      standardName: standardName.trim(),
      brand: brand.trim() || null,
      quantity: parsedQuantity,
      unitPriceCents: inputToCents(unitPrice),
      lineTotalCents: inputToCents(lineTotal),
    });
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
          <SheetTitle className="text-section-title font-medium text-ink">Edit Item</SheetTitle>
        </SheetHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6">
          {lineItem.rawItem && lineItem.rawItem !== standardName && (
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
              autoFocus
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
            Save
          </Button>

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
        </div>
      </SheetContent>
    </Sheet>
  );
}
