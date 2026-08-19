import { getSupabaseBrowserClient } from "./supabase/client";
import { transactionToInsertRow } from "./supabase/mappers";
import { newId } from "./id";
import { useInventoryStore } from "./store";
import { linkLineItemRefund } from "./receipt-line-items";
import type { ScannedReceiptLineItem, Transaction } from "./types";

/**
 * Creates a real refund transaction and links it to the returned line item
 * — one operation, not "call useInventoryStore's createTransaction(), then
 * separately link." createTransaction() is deliberately optimistic: it
 * updates local state and returns immediately, while the actual insert
 * happens in the background via persistOrRevert (see store.ts) — so
 * linking against its still-client-only id right after calling it is a
 * real race. 0012_line_item_returns.sql's validation trigger checks the
 * refund transaction actually exists server-side before allowing the
 * link, and loses that race close to 100% of the time in practice, always
 * failing with "can only be linked to a refund-type transaction in the
 * same household" even though the transaction *was* being created —
 * just not yet, from the database's point of view.
 *
 * This awaits the insert directly instead — the same await-before-
 * dependent-write ordering receipt-scan-session-store.ts already uses for
 * batch → drafts — then mirrors createTransaction's own local-state splice
 * and activity log so the UI updates the same way a normal optimistic
 * create would, just correctly sequenced against the trigger that depends
 * on it.
 */
export async function createAndLinkRefundTransaction(
  lineItem: ScannedReceiptLineItem,
  input: { accountId: string; occurredAt: string; amount: number; merchant: string | null; description: string | null }
): Promise<{ ok: true; transaction: Transaction; item: ScannedReceiptLineItem } | { ok: false; error: string }> {
  const store = useInventoryStore.getState();
  const timestamp = new Date().toISOString();
  const transaction: Transaction = {
    id: newId(),
    householdId: store.currentHouseholdId,
    accountId: input.accountId,
    occurredAt: input.occurredAt,
    postedAt: null,
    amount: input.amount,
    type: "refund",
    categoryId: null,
    merchant: input.merchant,
    description: input.description,
    notes: "",
    status: "posted",
    excludedFromReports: false,
    linkedTransactionId: null,
    source: "manual",
    importBatchId: null,
    createdByUserId: store.currentUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: null,
    permanentlyDeleteAfter: null,
    plaidTransactionId: null,
    userEdited: false,
  };

  const { error: insertError } = await getSupabaseBrowserClient().from("transactions").insert(transactionToInsertRow(transaction));
  if (insertError) return { ok: false, error: insertError.message };

  useInventoryStore.setState((s) => ({ transactions: [transaction, ...s.transactions] }));
  store.logActivity({
    entityType: "transaction",
    entityId: transaction.id,
    entityName: transaction.merchant ?? transaction.description ?? "Transaction",
    action: "created",
  });

  const linkResult = await linkLineItemRefund(lineItem, transaction.id, Math.round(input.amount * 100));
  if (!linkResult.ok) return { ok: false, error: linkResult.error };

  return { ok: true, transaction, item: linkResult.item };
}
