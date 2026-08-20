import { getSupabaseBrowserClient } from "./supabase/client";
import { scannedReceiptLineItemToInsertRow } from "./supabase/mappers";
import { newId } from "./id";
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

/**
 * Permanently removes one line item — not a soft delete. Unlike Item/
 * Container/Transaction, scanned_receipt_line_items has no trash lifecycle
 * of its own (0011_receipt_scanning.sql never gave it trashed_at); it's
 * supplementary itemization detail, not a first-class trashable entity,
 * and the parent transaction's own `amount` is independent of it
 * (confirm_scanned_transaction_draft() sets amount from the receipt's own
 * total, never by summing line items) — deleting a line item is pure
 * cleanup of a duplicate/mis-scanned entry, never a money event, so it
 * never touches the transaction. A linked refund (if any) is untouched
 * too, same reasoning unlinkLineItemRefund never deletes it.
 */
export async function deleteScannedReceiptLineItem(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseBrowserClient();
  // item_purchases_has_a_target (0017_household_ledger_core.sql) requires
  // at least one anchor to survive — the FK here is ON DELETE SET NULL,
  // so an item_purchases row anchored only by this line item (no
  // transaction_id) would otherwise violate that constraint and fail
  // this delete outright. Remove those links first, and await it before
  // the line-item delete fires so ordering is guaranteed.
  const { data: orphaned, error: lookupError } = await supabase
    .from("item_purchases")
    .select("id")
    .eq("scanned_receipt_line_item_id", id)
    .is("transaction_id", null);
  if (lookupError) return { ok: false, error: lookupError.message };
  if (orphaned && orphaned.length > 0) {
    const { error: unlinkError } = await supabase
      .from("item_purchases")
      .delete()
      .in("id", orphaned.map((p) => p.id as string));
    if (unlinkError) return { ok: false, error: unlinkError.message };
  }
  const { error } = await supabase.from("scanned_receipt_line_items").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Adds a line item straight to an already-confirmed transaction — no
 * draft, no AI extraction involved (0013_manual_line_items.sql made
 * draft_id nullable specifically for this). The real gap this closes: a
 * receipt scan can legitimately extract a transaction's store/date/total
 * correctly while returning zero line items (a real one did — see
 * draftNeedsReview's "No items could be identified" reason), and until
 * this existed the only way to add the missing itemization was a full
 * re-scan. rawItem is set equal to standardName (there's no original
 * scanned/imported text for a hand-typed item — LineItemFormSheet's
 * "Originally captured as ..." hint only shows when the two differ, so
 * this naturally shows nothing for a manual item, which is correct).
 */
export async function createManualLineItem(
  householdId: string,
  transactionId: string,
  values: { standardName: string; brand: string | null; quantity: number; unitPriceCents: number | null; lineTotalCents: number | null }
): Promise<{ ok: true; item: ScannedReceiptLineItem } | { ok: false; error: string }> {
  const item: ScannedReceiptLineItem = {
    id: newId(),
    householdId,
    draftId: null,
    transactionId,
    rawItem: values.standardName,
    standardName: values.standardName,
    brand: values.brand,
    categoryGuessId: null,
    subcategoryGuessId: null,
    subcategoryGuessText: null,
    quantity: values.quantity,
    unitPriceCents: values.unitPriceCents,
    lineTotalCents: values.lineTotalCents,
    confidence: null,
    refundTransactionId: null,
    refundedAmountCents: null,
  };
  const { error } = await getSupabaseBrowserClient().from("scanned_receipt_line_items").insert(scannedReceiptLineItemToInsertRow(item));
  if (error) return { ok: false, error: error.message };
  return { ok: true, item };
}
