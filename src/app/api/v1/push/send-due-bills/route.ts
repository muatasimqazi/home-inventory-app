import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { filterByEnabledDomain } from "@/lib/push/domain-filter";
import { formatCurrency } from "@/lib/format";

export const runtime = "nodejs";

const DOMAIN_KEY = "finance";
const EVENT_TYPE = "bill.due";
const LOOKAHEAD_DAYS = 3;

interface RecurringBillRow {
  id: string;
  household_id: string;
  name: string;
  expected_amount: number;
  next_due_date: string;
  owner_user_id: string | null;
  is_active: boolean;
  trashed_at: string | null;
}

/**
 * The platform's push-sending job (docs/Household Hub Addendum.md §5,
 * generalized per docs/Platform Foundation Addendum.md §2) — first real
 * trigger wired to Finance's recurring bills (household_tasks doesn't
 * exist in code yet; when it does, its own due-item query extends this
 * same job rather than standing up a second one, per the addendum's own
 * stated goal). Finds bills due within LOOKAHEAD_DAYS across every
 * household, skips anything already logged for this exact due-date
 * occurrence (event_notification_log's UNIQUE constraint is the real
 * guarantee; the SELECT below is just an optimization to avoid a wasted
 * push attempt), and respects notification_preferences (default enabled
 * — a household member has to actively turn a category off).
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-due-bills called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const today = new Date();
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + LOOKAHEAD_DAYS);
  const todayIso = today.toISOString().slice(0, 10);
  const windowEndIso = windowEnd.toISOString().slice(0, 10);

  const { data: bills, error } = await admin
    .from("recurring_bills")
    .select("id, household_id, name, expected_amount, next_due_date, owner_user_id, is_active, trashed_at")
    .eq("is_active", true)
    .is("trashed_at", null)
    .gte("next_due_date", todayIso)
    .lte("next_due_date", windowEndIso);
  if (error) {
    console.error("push/send-due-bills: couldn't list due bills:", error);
    return NextResponse.json({ error: "Couldn't list due bills." }, { status: 500 });
  }

  let notifiedCount = 0;
  let skippedCount = 0;

  const candidateBills = await filterByEnabledDomain(admin, (bills ?? []) as RecurringBillRow[], "finance");

  for (const bill of candidateBills) {
    const occurrenceKey = bill.next_due_date;

    const { data: alreadySent } = await admin
      .from("event_notification_log")
      .select("id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "recurring_bill")
      .eq("entity_id", bill.id)
      .eq("occurrence_key", occurrenceKey)
      .maybeSingle();
    if (alreadySent) {
      skippedCount++;
      continue;
    }

    // Joint bill (owner_user_id null) -> every household member; personal
    // bill -> just its owner. Bill shares (finance_bill_shares) are a
    // "can view" grant, not necessarily "should be pushed a reminder" —
    // deliberately not treated as notification recipients here.
    let recipientUserIds: string[];
    if (bill.owner_user_id) {
      recipientUserIds = [bill.owner_user_id];
    } else {
      const { data: members } = await admin.from("members").select("user_id").eq("household_id", bill.household_id);
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
      // No row = default enabled/push (opt-out model, PRD-consistent
      // "automatic but always correctable" posture) — a household member
      // has to actually create a disabling preference row, never opt in blind.
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const result = await sendPushToUser(admin, userId, {
        title: `${bill.name} is due soon`,
        body: `${formatCurrency(bill.expected_amount)} due ${bill.next_due_date === todayIso ? "today" : `on ${bill.next_due_date}`}`,
        url: "/finance/recurring",
        tag: `bill-${bill.id}`,
      });
      if (result.sent > 0) sentToAnyone = true;
    }

    if (sentToAnyone) {
      await admin.from("event_notification_log").insert({
        household_id: bill.household_id,
        domain_key: DOMAIN_KEY,
        entity_type: "recurring_bill",
        entity_id: bill.id,
        occurrence_key: occurrenceKey,
      });
      notifiedCount++;
    }
  }

  return NextResponse.json({ dueCount: candidateBills.length, notifiedCount, skippedCount });
}

// Vercel Cron sends GET by default — accept both so the same route works
// whether it's hit by the scheduler or a manual/testing POST (same
// pattern as /api/v1/plaid/sync-all).
export const GET = POST;
