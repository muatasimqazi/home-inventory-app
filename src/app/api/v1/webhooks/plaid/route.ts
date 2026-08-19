import { NextResponse } from "next/server";
import { verifyPlaidWebhook } from "@/lib/plaid/verify-webhook";
import { syncPlaidItem } from "@/lib/plaid/sync";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface PlaidWebhookPayload {
  webhook_type: string;
  webhook_code: string;
  item_id: string;
  error?: { error_code?: string } | null;
}

/**
 * Plaid's webhook (docs/Bank Sync Addendum.md §6) — same overall shape as
 * the Resend inbound-email webhook: verify against the raw body first
 * (JWT here instead of Svix, see lib/plaid/verify-webhook.ts), 200-and-
 * log for anything not retryable, 500 only for a real failure on our
 * side.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const verification = await verifyPlaidWebhook(rawBody, request.headers.get("plaid-verification"));
  if (!verification.ok) {
    console.error("webhooks/plaid: signature verification failed:", verification.error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: PlaidWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: itemRow } = await admin.from("plaid_items").select("*").eq("plaid_item_id", payload.item_id).maybeSingle();
  if (!itemRow) {
    // Not retryable — genuinely nothing to route this to (e.g. a webhook
    // arriving after the household already disconnected this Item).
    console.error(`webhooks/plaid: no plaid_items row for item_id ${payload.item_id}`);
    return NextResponse.json({ ok: true, routed: false });
  }

  if (payload.webhook_type === "TRANSACTIONS") {
    // SYNC_UPDATES_AVAILABLE is the current webhook_code for "new data is
    // ready to sync"; DEFAULT_UPDATE/INITIAL_UPDATE/HISTORICAL_UPDATE are
    // the legacy codes some institutions still send — all mean the same
    // thing for a cursor-based /transactions/sync consumer: go sync.
    const syncTriggeringCodes = ["SYNC_UPDATES_AVAILABLE", "DEFAULT_UPDATE", "INITIAL_UPDATE", "HISTORICAL_UPDATE"];
    if (syncTriggeringCodes.includes(payload.webhook_code)) {
      const result = await syncPlaidItem(admin, {
        id: itemRow.id,
        household_id: itemRow.household_id,
        plaid_item_id: itemRow.plaid_item_id,
        access_token: itemRow.access_token,
        cursor: itemRow.cursor,
        created_by_user_id: itemRow.created_by_user_id,
      });
      return NextResponse.json({ ok: true, routed: true, synced: result });
    }
    return NextResponse.json({ ok: true, routed: true, ignored: payload.webhook_code });
  }

  if (payload.webhook_type === "ITEM" && payload.webhook_code === "ERROR") {
    const errorCode = payload.error?.error_code ?? "unknown_error";
    const status = errorCode === "ITEM_LOGIN_REQUIRED" ? "reauth_required" : "error";
    await admin.from("plaid_items").update({ status, error_code: errorCode }).eq("id", itemRow.id);
    return NextResponse.json({ ok: true, routed: true, status });
  }

  // Every other webhook_type/webhook_code (Link events, Auth, Identity,
  // etc.) — acknowledged, not acted on. Only Transactions and Item-error
  // events are relevant to this integration's scope (§1).
  return NextResponse.json({ ok: true, routed: true, ignored: `${payload.webhook_type}/${payload.webhook_code}` });
}
