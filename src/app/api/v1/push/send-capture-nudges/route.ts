import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push/send";
import { filterByEnabledDomain } from "@/lib/push/domain-filter";
import { formatCurrency } from "@/lib/format";

export const runtime = "nodejs";

const DOMAIN_KEY = "inventory";
const EVENT_TYPE = "capture.nudge";
// A single-occurrence event (a transaction doesn't recur the way a bill's
// due date does) — event_notification_log's UNIQUE constraint just needs
// *a* stable occurrence_key per transaction, not one that varies.
const OCCURRENCE_KEY = "nudge";
// How far back to look for newly-posted transactions on each run. Wider
// than the daily cron cadence on purpose (a missed/late run shouldn't mean
// a missed nudge) — event_notification_log's UNIQUE constraint is what
// actually prevents a duplicate send, so a wider window only means more
// rows re-checked, not more pushes sent.
const LOOKBACK_HOURS = 48;

/**
 * Household Ledger PRD §26 (Finance-Triggered Capture) — the retention
 * loop: "the finance feed, which already updates constantly, as the
 * trigger for inventory capture." Same scheduled-job shape as
 * send-due-bills (Household Hub Addendum §5 / Platform Foundation
 * Addendum §2's generalized push pipeline) — find qualifying rows, skip
 * anything already logged, respect notification_preferences, send.
 *
 * "Qualifying" per the PRD: a transaction above a configurable amount
 * threshold, or from a durable-goods merchant category. There's no fixed
 * merchant-category taxonomy in this schema to key off of — `categories`
 * rows are household-defined free text (Implementation Plan §1) — so
 * durable-goods intent is matched against category *names* and a short
 * list of well-known durable-goods retailers' merchant names, both
 * case-insensitive substring matches. This is a keyword filter feeding a
 * notification trigger, not item/photo auto-classification — the PRD §6
 * non-scope line ("no auto-classification beyond the two Universal Scan
 * launch modes") is about what happens to a *photo*, not this.
 */
const AMOUNT_THRESHOLD = Number(process.env.CAPTURE_NUDGE_THRESHOLD ?? 150);

const DURABLE_GOODS_CATEGORY_KEYWORDS = ["home improvement", "furniture", "electronics", "appliance", "hardware", "home goods"];

// Deliberately excludes big-box grocery/wholesale merchants (e.g. Costco)
// even though they sometimes ring up a durable good — PRD §25 itself uses
// "Costco $312.47" as the example of a merchant that's genuinely ambiguous
// without a receipt. Those still qualify via AMOUNT_THRESHOLD when the
// purchase is actually big-ticket; they just don't auto-qualify on
// merchant name alone the way an unambiguous single-category retailer does.
const DURABLE_GOODS_MERCHANTS = [
  "home depot",
  "lowe's",
  "lowes",
  "ikea",
  "best buy",
  "wayfair",
  "west elm",
  "pottery barn",
  "crate & barrel",
  "crate and barrel",
  "ashley furniture",
  "restoration hardware",
  "ace hardware",
  "menards",
  "world market",
  "williams-sonoma",
];

interface TransactionRow {
  id: string;
  household_id: string;
  account_id: string;
  amount: number;
  type: string;
  merchant: string | null;
  category_id: string | null;
  occurred_at: string;
  created_at: string;
  trashed_at: string | null;
}

function matchesDurableGoods(merchant: string | null, categoryName: string | null): boolean {
  const merchantLower = merchant?.toLowerCase() ?? "";
  const categoryLower = categoryName?.toLowerCase() ?? "";
  return DURABLE_GOODS_MERCHANTS.some((m) => merchantLower.includes(m)) || DURABLE_GOODS_CATEGORY_KEYWORDS.some((c) => categoryLower.includes(c));
}

export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("push/send-capture-nudges called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();
  const sinceIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  const { data: txns, error } = await admin
    .from("transactions")
    .select("id, household_id, account_id, amount, type, merchant, category_id, occurred_at, created_at, trashed_at")
    .eq("type", "expense")
    .is("trashed_at", null)
    .gte("created_at", sinceIso);
  if (error) {
    console.error("push/send-capture-nudges: couldn't list recent transactions:", error);
    return NextResponse.json({ error: "Couldn't list recent transactions." }, { status: 500 });
  }

  // "both": this nudge reads a Finance signal (a transaction) to prompt
  // an Inventory action (log what you bought) — a household that's opted
  // out of either half of that shouldn't get it, not just the one domain
  // this query happens to read from.
  const candidateRows = await filterByEnabledDomain(admin, (txns ?? []) as TransactionRow[], "both");

  // categories is small per household (and this job runs across every
  // household) — one fetch of every category name, looked up by id below,
  // is simpler than a query per transaction.
  const categoryIds = [...new Set(candidateRows.map((t) => t.category_id).filter((id): id is string => !!id))];
  const categoryNameById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: categoryRows } = await admin.from("categories").select("id, name").in("id", categoryIds);
    for (const c of categoryRows ?? []) categoryNameById.set(c.id as string, c.name as string);
  }

  let notifiedCount = 0;
  let skippedAlreadySent = 0;
  let skippedAlreadyLinked = 0;
  let skippedNotQualifying = 0;

  for (const txn of candidateRows) {
    const absAmount = Math.abs(txn.amount);
    const categoryName = txn.category_id ? categoryNameById.get(txn.category_id) ?? null : null;
    if (absAmount < AMOUNT_THRESHOLD && !matchesDurableGoods(txn.merchant, categoryName)) {
      skippedNotQualifying++;
      continue;
    }

    const { data: alreadySent } = await admin
      .from("event_notification_log")
      .select("id")
      .eq("domain_key", DOMAIN_KEY)
      .eq("entity_type", "transaction")
      .eq("entity_id", txn.id)
      .eq("occurrence_key", OCCURRENCE_KEY)
      .maybeSingle();
    if (alreadySent) {
      skippedAlreadySent++;
      continue;
    }

    // Already captured — a household member linked this transaction to an
    // item some other way (manual link, receipt-scan match) before the job
    // got to it. Nudging to "log what you bought" would be noise at that
    // point.
    const { data: alreadyLinked } = await admin.from("item_purchases").select("id").eq("transaction_id", txn.id).limit(1).maybeSingle();
    if (alreadyLinked) {
      skippedAlreadyLinked++;
      continue;
    }

    const { data: account } = await admin.from("accounts").select("owner_user_id").eq("id", txn.account_id).maybeSingle();

    // Same recipient rule as send-due-bills: a personal account's owner
    // only, a joint account's every household member. finance_account_shares
    // are a "can view" grant, not a notification recipient list, here either.
    let recipientUserIds: string[];
    if (account?.owner_user_id) {
      recipientUserIds = [account.owner_user_id as string];
    } else {
      const { data: members } = await admin.from("members").select("user_id").eq("household_id", txn.household_id);
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
      // No row = default enabled/push, same opt-out posture as bill.due.
      if (pref && (!pref.enabled || pref.channel !== "push")) continue;

      const merchantLabel = txn.merchant ?? "a store";
      const result = await sendPushToUser(admin, userId, {
        title: `You spent ${formatCurrency(absAmount)} at ${merchantLabel}`,
        body: "Want to log what you bought?",
        // Deep-links the camera straight into a capture session pre-linked
        // to this transaction (src/lib/capture-session-store.ts's
        // linkTransactionId) — /capture/review then attaches item_purchases
        // to whatever's saved, source 'finance_nudge', no separate manual
        // linking step (PRD §26's exact mechanism).
        url: `/capture?linkTransactionId=${txn.id}`,
        tag: `capture-nudge-${txn.id}`,
      });
      if (result.sent > 0) sentToAnyone = true;
    }

    if (sentToAnyone) {
      // Same SELECT-then-INSERT shape as send-due-bills (the UNIQUE
      // constraint on domain_key/entity_type/entity_id/occurrence_key is
      // the real duplicate-send guarantee, not the earlier alreadySent
      // check — a race between overlapping invocations is an accepted,
      // pre-existing tradeoff of that pattern, not something reworked
      // here). Unlike send-due-bills, this does check the insert's own
      // error: a silently-dropped insert failure here wouldn't just risk
      // a duplicate push next run, it'd mean this run's own notifiedCount
      // overclaims sends that never actually got logged.
      const { error: logError } = await admin.from("event_notification_log").insert({
        household_id: txn.household_id,
        domain_key: DOMAIN_KEY,
        entity_type: "transaction",
        entity_id: txn.id,
        occurrence_key: OCCURRENCE_KEY,
      });
      if (logError) {
        console.error("push/send-capture-nudges: couldn't log sent notification (possible duplicate risk on next run):", txn.id, logError.message);
      }
      notifiedCount++;
    }
  }

  return NextResponse.json({
    candidateCount: candidateRows.length,
    notifiedCount,
    skippedAlreadySent,
    skippedAlreadyLinked,
    skippedNotQualifying,
  });
}

// Vercel Cron sends GET by default — accept both, same as send-due-bills.
export const GET = POST;
