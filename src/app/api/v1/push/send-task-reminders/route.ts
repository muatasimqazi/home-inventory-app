import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";

export const runtime = "nodejs";

const DOMAIN_KEY = "tasks";
const EVENT_TYPE = "task.due";
const LOOKAHEAD_HOURS = 24;

interface HouseholdTaskRow {
  id: string;
  household_id: string;
  title: string;
  due_at: string;
  assigned_to_person_id: string | null;
  is_active: boolean;
  trashed_at: string | null;
}

interface PersonRow {
  id: string;
  linked_user_id: string | null;
}

/**
 * The platform's push-sending job (docs/Household Hub Addendum.md §5,
 * generalized per docs/Platform Foundation Addendum.md §2), extended with
 * household_tasks' own due-item query — exactly what send-due-bills'
 * header comment says a Tasks domain should do once household_tasks
 * exists, rather than standing up a second pipeline. Byte-for-byte the
 * same shape as send-due-bills (CRON_SECRET check, event_notification_log
 * dedupe, notification_preferences opt-out check, sendPushToUser), with
 * two differences: no filterByEnabledDomain call (Tasks has no
 * household.tasks_enabled flag — always-on, same call as Notes), and no
 * lower bound on the due-date query (an overdue task should keep
 * reminding, unlike a bill, which has no overdue concept at all — see
 * lib/selectors.ts's daysUntilTask() comment).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-task-reminders called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const windowEnd = new Date(Date.now() + LOOKAHEAD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: tasks, error } = await admin
    .from("household_tasks")
    .select("id, household_id, title, due_at, assigned_to_person_id, is_active, trashed_at")
    .eq("is_active", true)
    .is("trashed_at", null)
    .lte("due_at", windowEnd);
  if (error) {
    console.error("push/send-task-reminders: couldn't list due tasks:", error);
    return NextResponse.json({ error: "Couldn't list due tasks." }, { status: 500 });
  }

  const candidateTasks = (tasks ?? []) as HouseholdTaskRow[];

  // One batched lookup for every assigned person's linked_user_id, rather
  // than a query per task.
  const personIds = [...new Set(candidateTasks.map((t) => t.assigned_to_person_id).filter((id): id is string => !!id))];
  const peopleById = new Map<string, PersonRow>();
  if (personIds.length > 0) {
    const { data: people } = await admin.from("people").select("id, linked_user_id").in("id", personIds);
    for (const p of (people ?? []) as PersonRow[]) peopleById.set(p.id, p);
  }

  let notifiedCount = 0;
  let skippedCount = 0;

  for (const task of candidateTasks) {
    const occurrenceKey = task.due_at;

    const { data: alreadySent } = await admin
      .from("event_notification_log")
      .select("id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "household_task")
      .eq("entity_id", task.id)
      .eq("occurrence_key", occurrenceKey)
      .maybeSingle();
    if (alreadySent) {
      skippedCount++;
      continue;
    }

    // Assigned to a managed profile with no login (linked_user_id null) ->
    // no recipient, skip silently — a kid without an account can't
    // receive a push. Unassigned -> every household member, same "joint"
    // shape as send-due-bills' owner_user_id-null case.
    let recipientUserIds: string[];
    if (task.assigned_to_person_id) {
      const person = peopleById.get(task.assigned_to_person_id);
      recipientUserIds = person?.linked_user_id ? [person.linked_user_id] : [];
    } else {
      const { data: members } = await admin.from("members").select("user_id").eq("household_id", task.household_id);
      recipientUserIds = (members ?? []).map((m) => m.user_id as string);
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
      // No row = default enabled/push (opt-out model, same as every other event type).
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const isOverdue = new Date(task.due_at).getTime() < Date.now();
      const result = await sendPushToUser(admin, userId, {
        title: task.title,
        body: isOverdue ? "Overdue" : "Due today",
        url: `/tasks/${task.id}`,
        tag: `task-${task.id}`,
      });
      if (result.sent > 0) sentToAnyone = true;
    }

    if (sentToAnyone) {
      await admin.from("event_notification_log").insert({
        household_id: task.household_id,
        domain_key: DOMAIN_KEY,
        entity_type: "household_task",
        entity_id: task.id,
        occurrence_key: occurrenceKey,
      });
      notifiedCount++;
    }
  }

  return NextResponse.json({ dueCount: candidateTasks.length, notifiedCount, skippedCount });
}

// Vercel Cron sends GET by default — accept both.
export const GET = POST;
