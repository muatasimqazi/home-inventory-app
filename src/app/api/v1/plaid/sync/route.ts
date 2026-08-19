import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/plaid/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";

/** Manual "Sync now" (docs/Bank Sync Addendum.md §6) — one item, triggered by a household member who doesn't want to wait for the webhook or nightly cron. */
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
  const { data: itemRow, error } = await admin.from("plaid_items").select("*").eq("id", plaidItemId).maybeSingle();
  if (error || !itemRow || itemRow.household_id !== householdId) {
    return NextResponse.json({ error: "Plaid item not found." }, { status: 404 });
  }

  const result = await syncPlaidItem(admin, {
    id: itemRow.id,
    household_id: itemRow.household_id,
    plaid_item_id: itemRow.plaid_item_id,
    access_token: itemRow.access_token,
    cursor: itemRow.cursor,
    created_by_user_id: itemRow.created_by_user_id,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
