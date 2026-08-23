import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { filterByEnabledDomain } from "@/lib/push/domain-filter";
import { formatCurrency } from "@/lib/format";

export const runtime = "nodejs";

const DOMAIN_KEY = "finance";
const EVENT_TYPE = "debt_payment.due_today";

interface RecurringBillRow {
  id: string;
  household_id: string;
  name: string;
  expected_amount: number;
  next_due_date: string;
  owner_user_id: string | null;
}

/**
 * "Day of" reminders for bills explicitly marked isDebtPayment (a credit
 * card/loan/mortgage payment) — a narrower, same-day counterpart to
 * send-due-bills' generic 3-day heads-up (which already covers every
 * recurring bill, debt or not, and keeps firing that earlier reminder for
 * these too; this is additive, not a replacement). Distinct domain/event
 * key (debt_payment.due_today) and a distinct occurrence_key suffix
 * (":due_today") so this doesn't collide with send-due-bills' own
 * event_notification_log row for the same bill+due-date — both jobs
 * would otherwise share the exact same (domain_key, entity_type,
 * entity_id, occurrence_key) tuple for a bill due within the 3-day
 * window, and the second one to run would silently no-op against the
 * first's log entry instead of sending its own push.
 *
 * isDebtPayment, not accountId's type: an earlier version of this query
 * filtered by account_id pointing at a credit_card/loan/mortgage Account,
 * which is wrong — that field means "charged to/paid from this account,"
 * and a subscription is routinely charged to a credit card without being
 * a payment on it. Confirmed live: that version pushed reminders for
 * subscriptions billed to a card, not the card's own payment. See
 * 0029_recurring_bill_debt_payment.sql.
 *
 * Missed a day the cron didn't run for whatever reason? No catch-up
 * window — exact-date match only, matching "day of" literally. Same
 * design tradeoff send-due-bills' LOOKAHEAD_DAYS makes for its own
 * window, just narrower.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-debt-payments-due-today called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const todayIso = new Date().toISOString().slice(0, 10);

  const { data: bills, error } = await admin
    .from("recurring_bills")
    .select("id, household_id, name, expected_amount, next_due_date, owner_user_id")
    .eq("is_active", true)
    .eq("is_debt_payment", true)
    .is("trashed_at", null)
    .eq("next_due_date", todayIso);
  if (error) {
    console.error("push/send-debt-payments-due-today: couldn't list bills due today:", error);
    return NextResponse.json({ error: "Couldn't list bills due today." }, { status: 500 });
  }

  let notifiedCount = 0;
  let skippedCount = 0;

  const candidateBills = await filterByEnabledDomain(admin, (bills ?? []) as RecurringBillRow[], "finance");

  for (const bill of candidateBills) {
    const occurrenceKey = `${bill.next_due_date}:due_today`;

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

    // Same joint-vs-personal recipient shape as send-due-bills.
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
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const result = await sendPushToUser(admin, userId, {
        title: `${bill.name} payment due today`,
        body: `${formatCurrency(bill.expected_amount)} is due today.`,
        url: "/finance/recurring",
        tag: `debt-payment-${bill.id}-${bill.next_due_date}`,
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

// Vercel Cron sends GET by default — same accept-both shape as the other
// cron-driven routes (send-due-bills, plaid/sync-all).
export const GET = POST;
