import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { fetchWeatherSnapshot } from "@/lib/weather-server";
import { weatherAlertCopy } from "@/lib/weather";

export const runtime = "nodejs";

const DOMAIN_KEY = "weather";
const EVENT_TYPE = "daily_summary";

interface HouseholdRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
}

/**
 * "The intelligent part" — a daily weather push, same shape as
 * send-task-reminders (CRON_SECRET check, event_notification_log dedupe,
 * notification_preferences opt-out, sendPushToUser), adapted for a
 * household-level, non-entity event: there's no bill or task row this
 * notification is "about", so entity_type/entity_id use the household
 * itself and occurrence_key is today's UTC date — one send per household
 * per day, same intent as task.due's per-due-timestamp key but on a
 * calendar-day cadence instead. Only households with a location set
 * (0054_household_location.sql, via SetHouseholdLocationSheet) are
 * candidates — no location means no weather to report, same silent-skip
 * posture the widget itself takes.
 *
 * Recipients are every household member (weather isn't assigned to one
 * person the way a task can be), each individually opted in/out via
 * notification_preferences like every other event type — no
 * filterByEnabledDomain call, since weather has no household-level
 * enabled/disabled flag of its own, same as Notes/Tasks.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-weather-alerts called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const occurrenceKey = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const { data: households, error } = await admin.from("households").select("id, latitude, longitude, location_label").not("latitude", "is", null).not("longitude", "is", null);
  if (error) {
    console.error("push/send-weather-alerts: couldn't list households:", error);
    return NextResponse.json({ error: "Couldn't list households." }, { status: 500 });
  }

  const candidateHouseholds = (households ?? []) as HouseholdRow[];

  let notifiedCount = 0;
  let skippedCount = 0;

  for (const household of candidateHouseholds) {
    if (household.latitude === null || household.longitude === null) continue;

    const { data: alreadySent } = await admin
      .from("event_notification_log")
      .select("id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "household")
      .eq("entity_id", household.id)
      .eq("occurrence_key", occurrenceKey)
      .maybeSingle();
    if (alreadySent) {
      skippedCount++;
      continue;
    }

    const snapshot = await fetchWeatherSnapshot(household.latitude, household.longitude);
    if (!snapshot) {
      skippedCount++;
      continue;
    }

    const { data: members } = await admin.from("members").select("user_id").eq("household_id", household.id);
    const recipientUserIds = (members ?? []).map((m) => m.user_id as string);

    const { title, body } = weatherAlertCopy(snapshot, household.location_label);

    let sentToAnyone = false;
    for (const userId of recipientUserIds) {
      const { data: pref } = await admin
        .from("notification_preferences")
        .select("enabled, channel")
        .eq("user_id", userId)
        .eq("domain_key", DOMAIN_KEY)
        .eq("event_type", EVENT_TYPE)
        .maybeSingle();
      // No row = default enabled/push (opt-out model, same as every other event type).
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const result = await sendPushToUser(admin, userId, {
        title,
        body,
        url: "/dashboard",
        tag: `weather-${household.id}-${occurrenceKey}`,
      });
      if (result.sent > 0) sentToAnyone = true;
    }

    if (sentToAnyone) {
      await admin.from("event_notification_log").insert({
        household_id: household.id,
        domain_key: DOMAIN_KEY,
        entity_type: "household",
        entity_id: household.id,
        occurrence_key: occurrenceKey,
      });
      notifiedCount++;
    }
  }

  return NextResponse.json({ candidateCount: candidateHouseholds.length, notifiedCount, skippedCount });
}

// Vercel Cron sends GET by default — accept both.
export const GET = POST;
