import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { syncPlaidItem } from "@/lib/plaid/sync";

export const runtime = "nodejs";

/**
 * Nightly cron fallback (docs/Bank Sync Addendum.md §6, vercel.json's
 * `crons` entry) — syncs every active Plaid item across every household.
 * Pure safety net for a missed/failed webhook; the webhook path is what
 * normally keeps things current. Protected by CRON_SECRET, the same
 * pattern Vercel's own docs recommend for cron-triggered routes — Vercel
 * sends this as a bearer token automatically when the env var is set, so
 * a stray public hit can't trigger a sync storm across every household.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  // Fail closed in production if the secret was never configured — a
  // silently-open sync-everything route is a worse failure mode than
  // refusing to run, same posture the Resend webhook takes when its own
  // env vars are missing. Loose in dev so local manual testing doesn't
  // need a secret set up first.
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("plaid/sync-all called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const { data: items, error } = await admin.from("plaid_items").select("*").eq("status", "active");
  if (error) {
    console.error("plaid/sync-all: couldn't list active items:", error);
    return NextResponse.json({ error: "Couldn't list Plaid items." }, { status: 500 });
  }

  const results = await Promise.all(
    (items ?? []).map((itemRow) =>
      syncPlaidItem(admin, {
        id: itemRow.id,
        household_id: itemRow.household_id,
        plaid_item_id: itemRow.plaid_item_id,
        access_token: itemRow.access_token,
        cursor: itemRow.cursor,
        created_by_user_id: itemRow.created_by_user_id,
      }).then((result) => ({ itemId: itemRow.id, ...result }))
    )
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) console.error("plaid/sync-all: some items failed to sync:", failed);

  return NextResponse.json({ syncedCount: results.length, failedCount: failed.length, results });
}

// Vercel Cron always sends GET, not POST — accept both so the same route
// works whether it's hit by the scheduler or by a manual/testing POST.
export const GET = POST;
