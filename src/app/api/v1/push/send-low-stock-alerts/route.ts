import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";

const DOMAIN_KEY = "inventory";
const EVENT_TYPE = "item.low_stock";

interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  min_quantity: number | null;
  owner_person_id: string | null;
  is_shared: boolean;
  low_stock_since: string | null;
  status: string;
}

/**
 * Same generalized push pipeline as send-due-bills/send-capture-nudges
 * (docs/Platform Foundation Addendum.md §2): find qualifying rows, skip
 * anything already logged, respect notification_preferences, send.
 *
 * "Qualifying" here is level-triggered, not date-triggered like a bill's
 * due date — an item stays "low" for as long as its quantity sits at or
 * below min_quantity, however long that takes. low_stock_since
 * (supabase/migrations/0032_low_stock_alerts.sql, server-computed by
 * sync_item_location()) is what turns that into a one-shot-per-episode
 * event: it's a fresh timestamp exactly when the item *becomes* low, so
 * using it as event_notification_log's occurrence_key gives one alert
 * per episode — restock above the threshold and it clears, drop low
 * again and it's a new occurrence_key, so the next alert isn't blocked
 * by the UNIQUE constraint remembering the first one.
 *
 * Recipients mirror can_view_item() (0031_item_sharing.sql), not a
 * blanket "every household member": a private, unshared item's alert
 * would otherwise announce that item's name to people who can't even see
 * it in the app. Household items (owner_person_id null) and shared
 * personal items go to everyone; a private item goes to its owner alone,
 * or to nobody if that owner is a managed profile with no linked
 * account to push to.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-low-stock-alerts called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();

  const { data: rows, error } = await admin
    .from("items")
    .select("id, household_id, name, quantity, min_quantity, owner_person_id, is_shared, low_stock_since, status")
    .eq("status", "active")
    .not("min_quantity", "is", null)
    .not("low_stock_since", "is", null);
  if (error) {
    console.error("push/send-low-stock-alerts: couldn't list low-stock items:", error);
    return NextResponse.json({ error: "Couldn't list low-stock items." }, { status: 500 });
  }

  const candidateRows = (rows ?? []) as ItemRow[];

  let notifiedCount = 0;
  let skippedAlreadySent = 0;
  let skippedNoRecipient = 0;

  for (const item of candidateRows) {
    // low_stock_since (not null, filtered above) is the occurrence_key —
    // see this file's own doc comment for why.
    const occurrenceKey = item.low_stock_since as string;

    const { data: alreadySent } = await admin
      .from("event_notification_log")
      .select("id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "item")
      .eq("entity_id", item.id)
      .eq("occurrence_key", occurrenceKey)
      .maybeSingle();
    if (alreadySent) {
      skippedAlreadySent++;
      continue;
    }

    let recipientUserIds: string[];
    if (item.owner_person_id === null || item.is_shared) {
      const { data: members } = await admin.from("members").select("user_id").eq("household_id", item.household_id);
      recipientUserIds = (members ?? []).map((m) => m.user_id as string);
    } else {
      const { data: owner } = await admin.from("people").select("linked_user_id").eq("id", item.owner_person_id).maybeSingle();
      recipientUserIds = owner?.linked_user_id ? [owner.linked_user_id as string] : [];
    }
    if (recipientUserIds.length === 0) {
      skippedNoRecipient++;
      continue;
    }

    let sentToAnyone = false;
    for (const userId of recipientUserIds) {
      const { data: pref } = await admin
        .from("notification_preferences")
        .select("enabled, channel")
        .eq("user_id", userId)
        .eq("domain_key", DOMAIN_KEY)
        .eq("event_type", EVENT_TYPE)
        .maybeSingle();
      // No row = default enabled/push, same opt-out posture as every
      // other event this pipeline sends.
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const result = await sendPushToUser(admin, userId, {
        title: `${item.name} is running low`,
        body: `${item.quantity} left — minimum is ${item.min_quantity}.`,
        url: `/items/${item.id}`,
        // Same tag every time this item is low replaces rather than stacks
        // — occurrence_key already prevents a *duplicate send* for the
        // same episode, this just keeps the notification tray tidy if a
        // device somehow still has an older one showing.
        tag: `low-stock-${item.id}`,
      });
      if (result.sent > 0) sentToAnyone = true;
    }

    if (sentToAnyone) {
      const { error: logError } = await admin.from("event_notification_log").insert({
        household_id: item.household_id,
        domain_key: DOMAIN_KEY,
        entity_type: "item",
        entity_id: item.id,
        occurrence_key: occurrenceKey,
      });
      if (logError) {
        console.error("push/send-low-stock-alerts: couldn't log sent notification (possible duplicate risk on next run):", item.id, logError.message);
      }
      notifiedCount++;
    }
  }

  return NextResponse.json({
    candidateCount: candidateRows.length,
    notifiedCount,
    skippedAlreadySent,
    skippedNoRecipient,
  });
}

// Vercel Cron sends GET by default — accept both, same as the other jobs.
export const GET = POST;
