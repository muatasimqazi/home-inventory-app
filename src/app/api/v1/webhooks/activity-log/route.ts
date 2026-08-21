import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { ACTION_LABEL } from "@/lib/activity-copy";
import type { ActivityAction, ActivityEntityType } from "@/lib/types";

export const runtime = "nodejs";

const DOMAIN_KEY = "activity";
const EVENT_TYPE = "household.activity";

// Where a tap on the notification should land. Anything not covered here
// (household, or any future entity_type Phase 2 adds before this map is
// updated) falls back to the Activity feed itself, never a 404.
const ENTITY_PATH: Partial<Record<ActivityEntityType, (id: string) => string>> = {
  item: (id) => `/items/${id}`,
  container: (id) => `/containers/${id}`,
  location: (id) => `/locations/${id}`,
  account: () => "/finance/accounts",
  transaction: () => "/finance/transactions",
  category: () => "/finance/categories",
  recurring_bill: () => "/finance/recurring",
  person: () => "/settings/members",
  member: () => "/settings/members",
};

interface ActivityWebhookPayload {
  activityLogId: string;
  householdId: string;
  actorUserId: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityName: string;
  action: ActivityAction;
  detail: string | null;
  createdAt: string;
}

/**
 * The real-time half of household-activity push notifications (the
 * approved plan's Phase 1) — the counterpart to the two cron-poll jobs in
 * ../push/. This one isn't polled: 0023_activity_log_push_notify.sql's
 * `after insert on activity_log` trigger calls it directly (via pg_net,
 * async, fire-and-forget from Postgres' side) the instant any
 * logActivity() call in src/lib/store.ts lands a row, so it's under
 * api/v1/webhooks/ next to the other DB/provider-originated webhook (../
 * plaid/route.ts), not api/v1/push/ where the two scheduled jobs live.
 *
 * Recipients are every current household member — including the actor,
 * per the explicit, confirmed requirement (not an oversight): no
 * exclusion of new.actor_user_id anywhere below.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.ACTIVITY_NOTIFY_WEBHOOK_SECRET;
  if (process.env.NODE_ENV === "production" && !webhookSecret) {
    console.error("webhooks/activity-log called in production without ACTIVITY_NOTIFY_WEBHOOK_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (webhookSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${webhookSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  let payload: ActivityWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!payload.activityLogId || !payload.householdId || !payload.actorUserId || !payload.entityType || !payload.action) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  // event_notification_log's own UNIQUE constraint (domain_key,
  // entity_type, entity_id, occurrence_key) is the real guarantee, same
  // as both cron jobs — this SELECT only avoids a wasted send attempt.
  // occurrence_key is activity_log's own id: already unique per event,
  // so this fits the existing constraint with zero schema change.
  const { data: alreadySent } = await admin
    .from("event_notification_log")
    .select("id")
    .eq("domain_key", DOMAIN_KEY)
    .eq("entity_type", payload.entityType)
    .eq("entity_id", payload.entityId)
    .eq("occurrence_key", payload.activityLogId)
    .maybeSingle();
  if (alreadySent) {
    return NextResponse.json({ notifiedCount: 0, skipped: "already_sent" });
  }

  const { data: members, error: membersError } = await admin
    .from("members")
    .select("user_id, display_name")
    .eq("household_id", payload.householdId);
  if (membersError) {
    console.error("webhooks/activity-log: couldn't list household members:", membersError.message);
    return NextResponse.json({ error: "Couldn't list household members." }, { status: 500 });
  }

  const actor = (members ?? []).find((m) => m.user_id === payload.actorUserId);
  const actorDisplayName = (actor?.display_name as string | undefined) ?? "Someone";
  const actionLabel = ACTION_LABEL[payload.action] ?? payload.action;
  const url = (ENTITY_PATH[payload.entityType]?.(payload.entityId)) ?? "/activity";

  let notifiedCount = 0;
  for (const member of members ?? []) {
    const userId = member.user_id as string;

    const { data: pref } = await admin
      .from("notification_preferences")
      .select("enabled, channel")
      .eq("user_id", userId)
      .eq("domain_key", DOMAIN_KEY)
      .eq("event_type", EVENT_TYPE)
      .maybeSingle();
    // No row = default enabled/push (opt-out model, same as both existing
    // push jobs) — including the actor's own row, so "notify me about my
    // own actions too" is opted out the same explicit way as anything
    // else, not hardcoded as unconditional.
    if (pref && (!pref.enabled || pref.channel !== "push")) continue;

    const result = await sendPushToUser(admin, userId, {
      title: "Household activity",
      body: `${actorDisplayName} ${actionLabel} ${payload.entityName}`,
      url,
      tag: `activity-${payload.activityLogId}`,
    });
    if (result.sent > 0) notifiedCount++;
  }

  if (notifiedCount > 0) {
    const { error: logError } = await admin.from("event_notification_log").insert({
      household_id: payload.householdId,
      domain_key: DOMAIN_KEY,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      occurrence_key: payload.activityLogId,
    });
    // Not fatal — the pushes already went out — but worth knowing about:
    // a failed log write here means a retried webhook delivery (pg_net
    // doesn't currently retry, but nothing guarantees that stays true)
    // could re-send instead of no-op'ing on the unique constraint.
    if (logError) console.error("webhooks/activity-log: couldn't log sent notification:", payload.activityLogId, logError.message);
  }

  return NextResponse.json({ notifiedCount, memberCount: (members ?? []).length });
}
