import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/plaid/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { rowToPlaidItem } from "@/lib/supabase/mappers";
import type { PlaidItemRow } from "@/lib/supabase/mappers";

export const runtime = "nodejs";

/**
 * The only path the UI has to plaid_items metadata — that table has zero
 * RLS policies (docs/Bank Sync Addendum.md §4), so a client-side select
 * against it returns nothing no matter what. This route independently
 * verifies household membership, then returns rowToPlaidItem()'s
 * projection, which never includes access_token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const householdId = searchParams.get("householdId");
  if (!householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("plaid_items")
    .select("id, household_id, plaid_item_id, institution_id, institution_name, cursor, status, error_code, created_by_user_id, created_at, last_synced_at")
    .eq("household_id", householdId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("plaid/items: select failed:", error);
    return NextResponse.json({ error: "Couldn't load linked banks." }, { status: 500 });
  }

  // access_token/cursor are excluded from the select above entirely (not
  // just dropped after mapping) — belt-and-suspenders on top of
  // rowToPlaidItem() already not mapping them, and on top of the table
  // having no RLS policies for authenticated clients in the first place.
  const items = ((data ?? []) as Omit<PlaidItemRow, "access_token">[]).map((row) => rowToPlaidItem({ ...row, access_token: "" }));
  return NextResponse.json({ items });
}
