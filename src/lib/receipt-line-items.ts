import { getSupabaseBrowserClient } from "./supabase/client";
import { scannedReceiptLineItemToInsertRow } from "./supabase/mappers";
import type { ScannedReceiptLineItem } from "./types";

/**
 * Shared write path for editing a single receipt line item after the fact
 * — used both by the Transactions list's nested item rows and by
 * TransactionDetailSheet. Deliberately not a useInventoryStore action:
 * scanned_receipt_line_items is intentionally NOT tracked in the global
 * store (see the on-demand-fetch comments in transaction-detail-sheet.tsx
 * and the Transactions list's bulk fetch) — a store action would imply
 * state to keep in sync that doesn't exist there. Callers own their own
 * local copy and patch it themselves on success.
 */
export async function updateScannedReceiptLineItem(
  current: ScannedReceiptLineItem,
  patch: Partial<
    Pick<
      ScannedReceiptLineItem,
      "standardName" | "brand" | "quantity" | "unitPriceCents" | "lineTotalCents" | "refundTransactionId" | "refundedAmountCents"
    >
  >
): Promise<{ ok: true; item: ScannedReceiptLineItem } | { ok: false; error: string }> {
  const merged: ScannedReceiptLineItem = { ...current, ...patch };
  const { error } = await getSupabaseBrowserClient()
    .from("scanned_receipt_line_items")
    .update(scannedReceiptLineItemToInsertRow(merged))
    .eq("id", current.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: merged };
}

/**
 * Links this item to a real refund transaction (0012_line_item_returns.sql
 * — "returned" is derived from refundTransactionId being set, not a
 * separate status flag; a DB trigger rejects anything other than a real
 * type='refund' transaction in the same household). Caller is responsible
 * for the refund transaction itself already existing — either one the
 * user picked from their existing transactions, or one just created for
 * this specific return.
 */
export function linkLineItemRefund(current: ScannedReceiptLineItem, refundTransactionId: string, refundedAmountCents: number) {
  return updateScannedReceiptLineItem(current, { refundTransactionId, refundedAmountCents });
}

/** Unlinks a return — clears both fields. Never touches the refund transaction itself; that stays as its own real ledger entry, same reasoning trashing a transfer's leg doesn't delete data the other leg still needs. */
export function unlinkLineItemRefund(current: ScannedReceiptLineItem) {
  return updateScannedReceiptLineItem(current, { refundTransactionId: null, refundedAmountCents: null });
}
