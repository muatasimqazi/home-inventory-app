import { NextResponse } from "next/server";
import { Products, CountryCode } from "plaid";
import { getPlaidClient } from "@/lib/plaid/client";
import { requireHouseholdMember } from "@/lib/plaid/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/urls";

export const runtime = "nodejs";

/**
 * Creates a Plaid Link token (docs/Bank Sync Addendum.md §5 step 1).
 * `accessToken` is optional and only ever set by the client for a
 * "Reconnect" flow (Addendum §8) — passing an existing item's
 * access_token puts Link in update mode, which re-authenticates that
 * same Item instead of creating a new one.
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

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let accessToken: string | undefined;
  if (typeof plaidItemId === "string" && plaidItemId) {
    const admin = getSupabaseAdminClient();
    const { data: itemRow } = await admin.from("plaid_items").select("access_token, household_id").eq("id", plaidItemId).maybeSingle();
    if (!itemRow || itemRow.household_id !== householdId) {
      return NextResponse.json({ error: "Plaid item not found." }, { status: 404 });
    }
    accessToken = itemRow.access_token;
  }

  try {
    const plaidClient = getPlaidClient();
    const response = await plaidClient.linkTokenCreate({
      client_name: "Schuaz",
      language: "en",
      country_codes: [CountryCode.Us],
      user: { client_user_id: householdId },
      webhook: `${appOrigin()}/api/v1/webhooks/plaid`,
      // additional_consented_products (not a hard `products` requirement)
      // for Liabilities in BOTH modes — credit card APR/statement data.
      // Soft consent: not billed until actually called, and (unlike a
      // hard product) an institution that doesn't support it still shows
      // in Link rather than being excluded with "Connectivity not
      // supported." Reconnect (update mode) otherwise still omits
      // `products` itself per Plaid's own requirement — the Item already
      // has Transactions initialized — but adding Liabilities consent
      // here means any future reauth, for any reason, on any item, picks
      // it up as a side effect (docs/Bank Sync Addendum.md §8's existing
      // reconnect flow becomes the "Connect for interest rate info"
      // mechanism for an already-linked card, not a new flow).
      additional_consented_products: [Products.Liabilities],
      ...(accessToken ? { access_token: accessToken } : { products: [Products.Transactions] }),
    });
    return NextResponse.json({ linkToken: response.data.link_token });
  } catch (error) {
    console.error("plaid/link-token: linkTokenCreate failed:", error);
    return NextResponse.json({ error: "Couldn't start bank linking. Please try again." }, { status: 502 });
  }
}
