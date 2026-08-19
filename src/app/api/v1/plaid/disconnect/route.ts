import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid/client";
import { requireHouseholdMember } from "@/lib/plaid/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Disconnect (docs/Bank Sync Addendum.md §8) — calls Plaid's /item/remove
 * so the institution stops sharing data, then deletes the plaid_items
 * row. Linked `accounts` rows are kept (transaction history isn't lost);
 * they just stop being Plaid-linked — plaid_item_id/plaid_account_id are
 * cleared via the FK's `on delete set null`/manual clear below rather
 * than the accounts themselves being deleted.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { householdId, plaidItemId } = (body ?? {}) as { householdId?: unknown; plaidItemId?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  if (typeof plaidItemId !== "string" || !plaidItemId) {
    return NextResponse.json({ error: "`plaidItemId` is required." }, { status: 400 });
  }

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data: itemRow } = await admin.from("plaid_items").select("*").eq("id", plaidItemId).maybeSingle();
  if (!itemRow || itemRow.household_id !== householdId) {
    return NextResponse.json({ error: "Plaid item not found." }, { status: 404 });
  }

  try {
    await getPlaidClient().itemRemove({ access_token: itemRow.access_token });
  } catch (error) {
    // Not fatal — an already-revoked-on-Plaid's-side Item (user removed
    // access from their bank's own settings) fails this call but should
    // still be cleaned up on our side, not left dangling.
    console.error(`plaid/disconnect: itemRemove failed for item ${plaidItemId} (continuing with local cleanup):`, error);
  }

  // Clear the link on every account that pointed at this item before
  // deleting it — accounts.plaid_item_id has `on delete set null`, so
  // this is defense-in-depth for plaid_account_id specifically (that
  // column has no FK to clean itself up).
  await admin.from("accounts").update({ plaid_item_id: null, plaid_account_id: null }).eq("plaid_item_id", plaidItemId);
  const { error: deleteError } = await admin.from("plaid_items").delete().eq("id", plaidItemId);
  if (deleteError) {
    console.error("plaid/disconnect: couldn't delete plaid_items row:", deleteError);
    return NextResponse.json({ error: "Disconnected from the bank, but couldn't finish cleanup. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
