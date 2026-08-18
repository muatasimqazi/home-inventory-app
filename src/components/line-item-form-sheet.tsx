"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScannedReceiptLineItem } from "@/lib/types";

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
}

function centsToInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}

function inputToCents(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.round(n * 100);
}

/**
 * Edits one already-persisted receipt line item — reachable both from the
 * Transactions list's nested items and from TransactionDetailSheet's item
 * list (see updateScannedReceiptLineItem in lib/receipt-line-items.ts,
 * the shared write path both use). Deliberately narrower than the full
 * scanned_receipt_line_items schema: raw_item (the original captured/
 * imported text) stays read-only context, not editable — it's the record
 * of what was actually scanned/imported, same reasoning transactions.source
 * is never user-editable. Category isn't exposed here either; nothing in
 * either surface currently displays a per-item category to edit.
 *
 * Fields are seeded via lazy useState initializers, not a reseed effect —
 * matching TransactionFormSheet's own convention. Radix's SheetContent
 * unmounts its children when `open` goes false (no forceMount here), so a
 * fresh instance — and fresh initializer read of whatever `lineItem` is
 * current at that moment — is created each time the sheet reopens for a
 * different item. Relies on the caller fully closing before reopening for
 * a different item, which is how both call sites already work.
 */
export function LineItemFormSheet({ lineItem, onOpenChange, onSubmit, ...rest }: LineItemFormSheetProps) {
  if (!lineItem) return null;
  return <LineItemFormSheetInner lineItem={lineItem} onOpenChange={onOpenChange} onSubmit={onSubmit} {...rest} />;
}

function LineItemFormSheetInner({
  open,
  onOpenChange,
  lineItem,
  onSubmit,
}: LineItemFormSheetProps & { lineItem: ScannedReceiptLineItem }) {
  const [standardName, setStandardName] = useState(lineItem.standardName ?? lineItem.rawItem);
  const [brand, setBrand] = useState(lineItem.brand ?? "");
  const [quantity, setQuantity] = useState(String(lineItem.quantity));
  const [unitPrice, setUnitPrice] = useState(centsToInput(lineItem.unitPriceCents));
  const [lineTotal, setLineTotal] = useState(centsToInput(lineItem.lineTotalCents));
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Edit Item</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
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
        </div>
      </SheetContent>
    </Sheet>
  );
}
