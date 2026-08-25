import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid/client";
import { requireHouseholdMember } from "@/lib/plaid/authorize";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { mapPlaidAccountType } from "@/lib/plaid/account-mapping";
import { accountToInsertRow } from "@/lib/supabase/mappers";
import { normalizeAccountBalance } from "@/lib/selectors";
import { newId } from "@/lib/id";
import type { Account } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Bank Sync Addendum §5 steps 3-5 — exchanges Link's public_token for a
 * real access_token, records the Item, maps each Plaid account onto a
 * Shohaz account, and runs the initial sync synchronously before
 * responding so the household sees transactions immediately rather than
 * waiting on the first webhook.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { householdId, publicToken } = (body ?? {}) as { householdId?: unknown; publicToken?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }
  if (typeof publicToken !== "string" || !publicToken) {
    return NextResponse.json({ error: "`publicToken` is required." }, { status: 400 });
  }

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const plaidClient = getPlaidClient();
  const admin = getSupabaseAdminClient();

  let accessToken: string;
  let plaidItemId: string;
  try {
    const exchange = await plaidClient.itemPublicTokenExchange({ public_token: publicToken });
    accessToken = exchange.data.access_token;
    plaidItemId = exchange.data.item_id;
  } catch (error) {
    console.error("plaid/exchange-public-token: itemPublicTokenExchange failed:", error);
    return NextResponse.json({ error: "Couldn't finish linking that bank. Please try again." }, { status: 502 });
  }

  let accounts: Awaited<ReturnType<typeof plaidClient.accountsGet>>["data"]["accounts"];
  let institutionId: string | null;
  let institutionName: string | null;
  try {
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken });
    accounts = accountsResponse.data.accounts;
    institutionId = accountsResponse.data.item.institution_id ?? null;
    institutionName = accountsResponse.data.item.institution_name ?? null;
  } catch (error) {
    console.error("plaid/exchange-public-token: accountsGet failed:", error);
    return NextResponse.json({ error: "Linked, but couldn't read that bank's accounts. Try syncing again shortly." }, { status: 502 });
  }

  const { data: itemRow, error: itemInsertError } = await admin
    .from("plaid_items")
    .insert({
      id: newId(),
      household_id: householdId,
      plaid_item_id: plaidItemId,
      access_token: accessToken,
      institution_id: institutionId,
      institution_name: institutionName,
      cursor: null,
      status: "active",
      error_code: null,
      created_by_user_id: auth.userId,
      created_at: new Date().toISOString(),
      last_synced_at: null,
    })
    .select("*")
    .single();
  if (itemInsertError || !itemRow) {
    console.error("plaid/exchange-public-token: couldn't insert plaid_items row:", itemInsertError);
    return NextResponse.json({ error: "Couldn't save that bank connection. Please try again." }, { status: 500 });
  }

  // One Shohaz account per Plaid account. Starting balance is set from
  // Plaid's own reported balance (normalized the same way a manually
  // entered liability balance is) — the sync run just below reconciles
  // it precisely once real transaction history is in, but seeding it
  // here means the account shows a sane balance even before that
  // finishes (see syncPlaidItem's own reconciliation comment).
  for (const pa of accounts) {
    const created: Account = {
      id: newId(),
      householdId,
      name: pa.official_name || pa.name,
      type: mapPlaidAccountType(pa.type, pa.subtype),
      institutionName,
      currentBalance: 0,
      availableBalance: pa.balances.available,
      startingBalance: pa.balances.current !== null ? normalizeAccountBalance(mapPlaidAccountType(pa.type, pa.subtype), pa.balances.current) : 0,
      cardLastFour: pa.mask,
      ownerUserId: null, // Plaid-linked accounts land as joint/household by default — matches every other account creation path's default
      status: "active",
      openedAt: null,
      trashedAt: null,
      permanentlyDeleteAfter: null,
      plaidItemId: itemRow.id,
      plaidAccountId: pa.account_id,
      // Whoever linked the bank — same value plaid_items.created_by_user_id
      // already got a few lines up, from the same auth.userId.
      createdByUserId: auth.userId,
    };
    const { error: accountInsertError } = await admin.from("accounts").insert(accountToInsertRow(created));
    if (accountInsertError) console.error(`plaid/exchange-public-token: couldn't insert account for Plaid account ${pa.account_id}:`, accountInsertError);
  }

  const syncResult = await syncPlaidItem(admin, {
    id: itemRow.id,
    household_id: householdId,
    plaid_item_id: plaidItemId,
    access_token: accessToken,
    cursor: null,
    created_by_user_id: auth.userId,
  });

  return NextResponse.json({
    ok: true,
    plaidItemId: itemRow.id,
    institutionName,
    accountCount: accounts.length,
    initialSync: syncResult,
  });
}
