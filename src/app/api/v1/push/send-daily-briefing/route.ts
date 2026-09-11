import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { fetchWeatherSnapshot } from "@/lib/weather-server";
import { weatherCondition, weatherOutfitHints } from "@/lib/weather";
import { formatCurrency } from "@/lib/format";
import { timezoneForCoordinates, currentLocalHour, todayLocalRange } from "@/lib/timezone";

export const runtime = "nodejs";

const DOMAIN_KEY = "household";

interface HouseholdRow {
  id: string;
  latitude: number | null;
  longitude: number | null;
  location_label: string | null;
}

interface HouseholdTaskRow {
  id: string;
  title: string;
  assigned_to_person_id: string | null;
  owner_user_id: string;
  is_shared: boolean;
}

interface RecurringBillRow {
  id: string;
  name: string;
  expected_amount: number;
  owner_user_id: string | null;
  is_debt_payment: boolean;
}

interface PersonRow {
  id: string;
  linked_user_id: string | null;
}

interface BriefingPrefRow {
  user_id: string;
  notification_hour: number;
  include_weather: boolean;
  include_outfit: boolean;
  include_tasks: boolean;
  include_bills: boolean;
}

/** Same is_shared/owner_user_id/assigned_to_person_id visibility rules as send-task-reminders — a personal task only ever counts for its owner, an assigned shared task only for whoever it's assigned to (or nobody, if assigned to a managed profile with no login), an unassigned shared task counts for everyone. */
function taskVisibleToUser(task: HouseholdTaskRow, userId: string, peopleById: Map<string, PersonRow>): boolean {
  if (!task.is_shared) return task.owner_user_id === userId;
  if (task.assigned_to_person_id) return peopleById.get(task.assigned_to_person_id)?.linked_user_id === userId;
  return true;
}

/** Same joint(owner_user_id null)-vs-personal visibility as send-due-bills. */
function billVisibleToUser(bill: RecurringBillRow, userId: string): boolean {
  return bill.owner_user_id === null || bill.owner_user_id === userId;
}

/**
 * The "good morning" digest — greeting, today's weather with a plain-
 * language outfit hint (lib/weather.ts's weatherOutfitHints, already
 * built for Ask AI's "what should I wear today" and reused as-is here),
 * and what's due today (tasks, bills). Opt-in per user
 * (daily_briefing_preferences, 0059) — unlike this app's other push
 * events, which default to on — with each user picking their own send
 * hour and which of the four sections (weather/outfit/tasks/bills) they
 * want, rather than one household-wide 7am for everyone.
 *
 * Runs hourly (vercel.json), not once at a fixed UTC time — a user's
 * chosen hour has to mean their own household's local time, and
 * households span every timezone. lib/timezone.ts derives an IANA
 * timezone from the same lat/lon households.latitude/longitude already
 * store for the weather widget (no new location/timezone setting to
 * ask for); households with no location set are skipped entirely —
 * same constraint send-weather-alerts already has, since there's no
 * weather (or timezone) to work with otherwise. A handful of real
 * timezones (India UTC+5:30, Nepal UTC+5:45, parts of Australia) sit at
 * a half/45-minute offset, where an hourly tick can't land exactly on
 * the chosen hour boundary — a small, known slip, not worth a
 * sub-hourly cron (Vercel bills per invocation) to close.
 *
 * Weather/tasks/bills are fetched once per household and reused across
 * its recipients; each recipient's own include_* flags decide what
 * actually goes in their message, and tasks/bills are still filtered
 * per-recipient by the same personal/shared visibility rules their own
 * reminder jobs enforce (this route bypasses RLS via the admin client,
 * so — same as those — visibility has to be checked by hand here
 * rather than relying on it being automatic). event_notification_log is
 * keyed per recipient (entity_type "user"), not per household, since
 * different members can have different hours/opt-in status and each
 * needs their own "did they get today's briefing yet" answer.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-daily-briefing called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();

  const { data: households, error } = await admin.from("households").select("id, latitude, longitude, location_label").not("latitude", "is", null).not("longitude", "is", null);
  if (error) {
    console.error("push/send-daily-briefing: couldn't list households:", error);
    return NextResponse.json({ error: "Couldn't list households." }, { status: 500 });
  }

  const candidateHouseholds = (households ?? []) as HouseholdRow[];
  let notifiedCount = 0;
  let skippedCount = 0;

  for (const household of candidateHouseholds) {
    if (household.latitude === null || household.longitude === null) continue;

    const timezone = timezoneForCoordinates(household.latitude, household.longitude);
    if (!timezone) {
      skippedCount++;
      continue;
    }
    const hourNow = currentLocalHour(timezone);

    const { data: allPrefs } = await admin
      .from("daily_briefing_preferences")
      .select("user_id, notification_hour, include_weather, include_outfit, include_tasks, include_bills")
      .eq("household_id", household.id)
      .eq("enabled", true);
    const duePrefs = ((allPrefs ?? []) as BriefingPrefRow[]).filter((p) => p.notification_hour === hourNow);
    if (duePrefs.length === 0) {
      skippedCount++;
      continue;
    }

    const { startIso, endIso } = todayLocalRange(timezone);
    const occurrenceDate = startIso.slice(0, 10); // local calendar date this "today" actually refers to

    const { data: alreadySentRows } = await admin
      .from("event_notification_log")
      .select("entity_id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "user")
      .eq("occurrence_key", `${household.id}:${occurrenceDate}`)
      .in(
        "entity_id",
        duePrefs.map((p) => p.user_id)
      );
    const alreadySentUserIds = new Set((alreadySentRows ?? []).map((r) => r.entity_id as string));
    const pendingPrefs = duePrefs.filter((p) => !alreadySentUserIds.has(p.user_id));
    if (pendingPrefs.length === 0) {
      skippedCount++;
      continue;
    }

    const needsWeather = pendingPrefs.some((p) => p.include_weather || p.include_outfit);
    const snapshot = needsWeather ? await fetchWeatherSnapshot(household.latitude, household.longitude) : null;
    const condition = snapshot ? weatherCondition(snapshot.weatherCode) : null;
    const outfitHint = snapshot ? (weatherOutfitHints(snapshot)[0] ?? null) : null;

    const needsTasks = pendingPrefs.some((p) => p.include_tasks);
    const { data: tasks } = needsTasks
      ? await admin
          .from("household_tasks")
          .select("id, title, assigned_to_person_id, owner_user_id, is_shared")
          .eq("household_id", household.id)
          .eq("is_active", true)
          .is("trashed_at", null)
          .gte("due_at", startIso)
          .lt("due_at", endIso)
      : { data: [] };
    const tasksDueToday = (tasks ?? []) as HouseholdTaskRow[];

    const needsBills = pendingPrefs.some((p) => p.include_bills);
    const { data: bills } = needsBills
      ? await admin
          .from("recurring_bills")
          .select("id, name, expected_amount, owner_user_id, is_debt_payment")
          .eq("household_id", household.id)
          .eq("is_active", true)
          .is("trashed_at", null)
          .gte("next_due_date", startIso)
          .lt("next_due_date", endIso)
      : { data: [] };
    const billsDueToday = (bills ?? []) as RecurringBillRow[];

    const personIds = [...new Set(tasksDueToday.map((t) => t.assigned_to_person_id).filter((id): id is string => !!id))];
    const peopleById = new Map<string, PersonRow>();
    if (personIds.length > 0) {
      const { data: people } = await admin.from("people").select("id, linked_user_id").in("id", personIds);
      for (const p of (people ?? []) as PersonRow[]) peopleById.set(p.id, p);
    }

    for (const pref of pendingPrefs) {
      const userId = pref.user_id;
      const myTasks = pref.include_tasks ? tasksDueToday.filter((t) => taskVisibleToUser(t, userId, peopleById)) : [];
      const myBills = pref.include_bills ? billsDueToday.filter((b) => billVisibleToUser(b, userId)) : [];

      // "Good morning!" was hardcoded even for a briefing set to fire in
      // the afternoon or evening — the feature is opt-in with a custom
      // hour precisely so it isn't only a morning thing.
      const greeting = pref.notification_hour < 12 ? "Good morning!" : pref.notification_hour < 18 ? "Good afternoon!" : "Good evening!";
      const title = pref.include_weather && condition && snapshot ? `${greeting} ${condition.emoji} H${snapshot.todayHighF}° L${snapshot.todayLowF}°` : greeting;

      const parts: string[] = [];
      if (pref.include_outfit && outfitHint) parts.push(outfitHint.charAt(0).toUpperCase() + outfitHint.slice(1));
      if (myTasks.length === 1) parts.push(`1 task due today: ${myTasks[0].title}`);
      else if (myTasks.length > 1) parts.push(`${myTasks.length} tasks due today`);
      if (myBills.length === 1) parts.push(`${myBills[0].name} (${formatCurrency(myBills[0].expected_amount)}) due today`);
      else if (myBills.length > 1) parts.push(`${myBills.length} bills due today`);
      if (parts.length === 0) parts.push("Nothing on your plate today — enjoy it.");

      const result = await sendPushToUser(admin, userId, {
        title,
        body: parts.join(" · "),
        url: "/dashboard",
        tag: `daily-briefing-${household.id}-${occurrenceDate}`,
      });

      if (result.sent > 0) {
        await admin.from("event_notification_log").insert({
          household_id: household.id,
          domain_key: DOMAIN_KEY,
          entity_type: "user",
          entity_id: userId,
          occurrence_key: `${household.id}:${occurrenceDate}`,
        });
        notifiedCount++;
      }
    }
  }

  return NextResponse.json({ candidateCount: candidateHouseholds.length, notifiedCount, skippedCount });
}

// Vercel Cron sends GET by default — accept both.
export const GET = POST;
