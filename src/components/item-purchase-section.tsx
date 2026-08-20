"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { LinkPurchaseSheet } from "@/components/link-purchase-sheet";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToScannedReceiptLineItem, type ScannedReceiptLineItemRow } from "@/lib/supabase/mappers";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Account, ItemPurchase, ScannedReceiptLineItem, Transaction } from "@/lib/types";

/**
 * Purchase/warranty info for an item — PRD (docs/v4 - Enhanced Features)
 * §25 "Physical Item ↔ Financial Transaction", Household Ledger
 * Implementation Plan Workstream 3. This is the product's core
 * differentiator (see the Implementation Plan's note on Workstream 3) —
 * price, merchant, payment account, receipt, and warranty status, read
 * through the `item_purchases` link table (0017_household_ledger_core.sql).
 *
 * Ownership ("Belongs to") is deliberately not shown here — that's
 * item-ownership-section.tsx's job (Workstream 2), kept a separate file on
 * purpose per the Implementation Plan's Phase 0 split.
 */

const SOURCE_LABEL: Record<ItemPurchase["source"], string> = {
  manual: "Manual",
  ai_suggested: "Suggested match",
  finance_nudge: "From nudge",
};

// Calling Date.now() straight inside a component body is an impure render
// (react-hooks/purity) — pulled into its own plain helper, same pattern
// linked-banks-card.tsx's formatLastSynced() already uses for the same
// reason. warrantyEnd is freeform text (no format enforced at capture), so
// an unparsable value returns null ("unknown") rather than silently
// collapsing into "expired" and stating a false fact to the user.
function isWarrantyActive(warrantyEndIso: string): boolean | null {
  const end = new Date(warrantyEndIso).getTime();
  if (Number.isNaN(end)) return null;
  return end >= Date.now();
}

export function ItemPurchaseSection({ itemId }: { itemId: string }) {
  const items = useInventoryStore((s) => s.items);
  const allPurchases = useInventoryStore((s) => s.itemPurchases);
  const transactions = useInventoryStore((s) => s.transactions);
  const accounts = useInventoryStore((s) => s.accounts);
  const transactionAttachments = useInventoryStore((s) => s.transactionAttachments);
  const linkItemPurchase = useInventoryStore((s) => s.linkItemPurchase);
  const unlinkItemPurchase = useInventoryStore((s) => s.unlinkItemPurchase);

  const [linkOpen, setLinkOpen] = useState(false);
  // scanned_receipt_line_items is review-stage, on-demand data (like
  // transaction-detail-sheet.tsx's own copy of this pattern) — not part of
  // the store's always-hydrated bundle. Only fetched for links that still
  // need it: a link with no transactionId yet (receipt reviewed but not
  // confirmed) has nowhere else to get a price from.
  const [lineItemsById, setLineItemsById] = useState<Record<string, ScannedReceiptLineItem>>({});

  const item = items.find((it) => it.id === itemId);
  const purchases = useMemo(() => allPurchases.filter((p) => p.itemId === itemId), [allPurchases, itemId]);

  useEffect(() => {
    const pendingIds = purchases.filter((p) => !p.transactionId && p.scannedReceiptLineItemId).map((p) => p.scannedReceiptLineItemId as string);
    const missing = pendingIds.filter((id) => !lineItemsById[id]);
    if (missing.length === 0) return;
    let cancelled = false;
    getSupabaseBrowserClient()
      .from("scanned_receipt_line_items")
      .select("*")
      .in("id", missing)
      .then(({ data }) => {
        if (cancelled || !data) return;
        setLineItemsById((prev) => {
          const next = { ...prev };
          for (const row of data as ScannedReceiptLineItemRow[]) next[row.id] = rowToScannedReceiptLineItem(row);
          return next;
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-fetch when the set of pending links changes, not on every lineItemsById update
  }, [purchases]);

  if (!item) return null;

  const linkedTransactionIds = purchases.map((p) => p.transactionId).filter((id): id is string => !!id);

  async function handlePickTransaction(result: { id: string; suggested: boolean }) {
    const res = await linkItemPurchase({ itemId, transactionId: result.id, source: result.suggested ? "ai_suggested" : "manual" });
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't link that purchase.");
      return;
    }
    toast.success("Purchase linked");
  }

  function handleUnlink(purchaseId: string) {
    unlinkItemPurchase(purchaseId);
    toast("Link removed");
  }

  const warrantyEnd: string | null = item.extraDetails.warrantyEnd || null;
  const warrantyActive = warrantyEnd ? isWarrantyActive(warrantyEnd) : null;

  // Link/unlink is an edit action, same as Move/Edit/Favorite two sections
  // below on the item detail page — gated behind item.status === "active"
  // there, so this section shouldn't stay interactive for an archived or
  // trashed item when everything else on the page has already locked down.
  const editable = item.status === "active";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-ink">Purchase & Warranty</h2>
        {editable && (
          <button
            type="button"
            onClick={() => setLinkOpen(true)}
            className="flex items-center gap-1 text-caption font-medium text-yellow-text"
          >
            <Icon name="plus" size={13} /> Link a purchase
          </button>
        )}
      </div>

      {warrantyEnd && warrantyActive !== null && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-caption font-medium",
            warrantyActive ? "bg-badge-green-bg text-badge-green-text" : "bg-surface-muted text-muted-foreground"
          )}
        >
          <Icon name="shieldCheck" size={15} />
          {warrantyActive ? `Warranty active until ${formatDate(warrantyEnd)}` : `Warranty expired ${formatDate(warrantyEnd)}`}
        </div>
      )}

      {purchases.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-center text-caption text-muted-foreground">
          No purchase linked yet — link a transaction or scanned receipt to see price, merchant, and receipt here.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {purchases.map((purchase) => {
            const txn = transactions.find((t) => t.id === purchase.transactionId);
            return (
              <PurchaseRow
                key={purchase.id}
                purchase={purchase}
                transaction={txn}
                account={accounts.find((a) => a.id === txn?.accountId)}
                lineItem={purchase.scannedReceiptLineItemId ? lineItemsById[purchase.scannedReceiptLineItemId] : undefined}
                // Scoped to this purchase's own transaction, not the item as
                // a whole — an item can have more than one linked purchase,
                // and itemAttachments' item-level "receipt" kind (Workstream
                // 4) has no way to say which purchase it belongs to.
                hasReceipt={transactionAttachments.some((a) => a.transactionId === purchase.transactionId)}
                onUnlink={editable ? () => handleUnlink(purchase.id) : undefined}
              />
            );
          })}
        </div>
      )}

      {editable && (
        <LinkPurchaseSheet
          open={linkOpen}
          onOpenChange={setLinkOpen}
          mode="transaction"
          referenceDate={item.createdAt}
          excludeIds={linkedTransactionIds}
          onPick={handlePickTransaction}
        />
      )}
    </div>
  );
}

function PurchaseRow({
  purchase,
  transaction,
  account,
  lineItem,
  hasReceipt,
  onUnlink,
}: {
  purchase: ItemPurchase;
  transaction: Transaction | undefined;
  account: Account | undefined;
  lineItem: ScannedReceiptLineItem | undefined;
  hasReceipt: boolean;
  /** Undefined (not just a no-op) for an archived/trashed item — hides the control entirely rather than rendering a button that does nothing. */
  onUnlink: (() => void) | undefined;
}) {
  // A line item's own share of a receipt is the more accurate "what did
  // this specific thing cost" figure on a multi-item receipt — the
  // transaction total is the whole receipt (Receipt Scanning Addendum §2:
  // one receipt, one transaction). Prefer it when we have it; fall back to
  // the transaction's total for a link made straight to a transaction.
  const priceCents = lineItem?.lineTotalCents ?? (transaction ? Math.round(Math.abs(transaction.amount) * 100) : null);
  const merchant = transaction?.merchant ?? transaction?.description ?? lineItem?.standardName ?? lineItem?.rawItem ?? "Purchase";
  const date = transaction?.occurredAt ?? null;

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-body font-medium text-ink">{merchant}</p>
          <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro font-medium text-muted-foreground">
            {SOURCE_LABEL[purchase.source]}
          </span>
        </div>
        <p className="mt-0.5 text-caption text-muted-foreground">
          {date ? formatDate(date) : "Pending — receipt not yet confirmed as a transaction"}
          {account ? ` · Paid with ${account.name}` : ""}
          {hasReceipt ? " · Receipt attached" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {priceCents !== null && <span className="text-body font-semibold text-ink">{formatCurrency(priceCents / 100)}</span>}
        {onUnlink && (
          <button
            type="button"
            onClick={onUnlink}
            aria-label="Remove link"
            className="tap-target flex size-7 items-center justify-center rounded-full text-muted-foreground hover:text-danger"
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
