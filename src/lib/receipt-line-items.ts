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
  patch: Partial<Pick<ScannedReceiptLineItem, "standardName" | "brand" | "quantity" | "unitPriceCents" | "lineTotalCents">>
): Promise<{ ok: true; item: ScannedReceiptLineItem } | { ok: false; error: string }> {
  const merged: ScannedReceiptLineItem = { ...current, ...patch };
  const { error } = await getSupabaseBrowserClient()
    .from("scanned_receipt_line_items")
    .update(scannedReceiptLineItemToInsertRow(merged))
    .eq("id", current.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, item: merged };
}
