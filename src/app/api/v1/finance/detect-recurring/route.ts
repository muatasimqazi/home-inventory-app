import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rowToTransaction, rowToRecurringBill, rowToRecurringCandidateDismissal, type TransactionRow, type RecurringBillRow, type RecurringCandidateDismissalRow } from "@/lib/supabase/mappers";
import { detectRecurringFromTransactions, dismissalFullKey } from "@/lib/recurring-transaction-detection";

export const runtime = "nodejs";

// AI recurring-bill detection over a household's real transaction history
// (Workstream 4) — deliberately NOT a model call. lib/recurring-
// transaction-detection.ts's comment explains why: "is this merchant
// charging roughly the same amount every 28-31 days" is arithmetic over
// dates and amounts the code already does reliably (it's the same
// heuristic lib/recurring-detection.ts already ships for statement
// import), and an LLM would only add latency/cost/a new failure mode on
// top of that, not better answers. This route's whole job is the
// server-side data fetch (auth + RLS scoping) the detector needs, then
// handing its output back — same "the real work happens server-side,
// the client just calls the route" shape as every other /api/v1/*
// endpoint in this app, even though there's no Gateway/model involved
// here.
//
// Computed fresh from the DB on every call rather than trusting
// client-supplied transactions: RLS on `transactions`/`recurring_bills`/
// `recurring_candidate_dismissals` (all scoped via the account's own
// can_view_account()) does the privacy filtering for free this way, and
// it means a future scheduled job (e.g. a "new recurring charge found"
// notification, same shape as push/send-due-bills) could call the same
// detectRecurringFromTransactions() without a browser tab open at all.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId } = (body ?? {}) as { householdId?: unknown };
  if (typeof householdId !== "string" || !householdId) {
    return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const [transactionsRes, recurringBillsRes, dismissalsRes] = await Promise.all([
    supabase.from("transactions").select("*").eq("household_id", householdId).is("trashed_at", null),
    supabase.from("recurring_bills").select("*").eq("household_id", householdId),
    supabase.from("recurring_candidate_dismissals").select("*").eq("household_id", householdId),
  ]);

  const firstError = transactionsRes.error ?? recurringBillsRes.error ?? dismissalsRes.error;
  if (firstError) {
    console.error("Recurring detection query failed:", firstError);
    return NextResponse.json({ error: "Couldn't load transaction history. Please try again.", retryable: true }, { status: 502 });
  }

  const transactions = ((transactionsRes.data ?? []) as TransactionRow[]).map(rowToTransaction);
  const recurringBills = ((recurringBillsRes.data ?? []) as RecurringBillRow[]).map(rowToRecurringBill);
  const dismissals = ((dismissalsRes.data ?? []) as RecurringCandidateDismissalRow[]).map(rowToRecurringCandidateDismissal);
  const dismissedKeys = new Set(dismissals.map(dismissalFullKey));

  const candidates = detectRecurringFromTransactions(transactions, recurringBills, dismissedKeys);
  return NextResponse.json({ candidates });
}
