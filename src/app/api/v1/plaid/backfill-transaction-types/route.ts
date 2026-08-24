import { NextResponse } from "next/server";
import type { Transaction as PlaidTransaction } from "plaid";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPlaidClient } from "@/lib/plaid/client";
import { plaidTransactionType } from "@/lib/plaid/sync";

export const runtime = "nodejs";
// Full transaction history across every linked item can take a while to
// page through — well under Vercel's 300s default, but no reason to run
// against the shorter edge-adjacent default some routes opt into.
export const maxDuration = 120;

/**
 * One-off admin backfill, NOT wired into vercel.json crons — triggered
 * manually, once, to fix data written before the plaidTransactionType()
 * fix landed in lib/plaid/sync.ts. Every Plaid-synced transaction was
 * previously typed by amount sign alone (negative="expense",
 * positive="income"), which can't tell a real deposit apart from a
 * credit-card/loan payment landing as a positive "credit" on that
 * account — so every already-synced card/loan payment or account
 * transfer is still sitting in the DB mistyped as income, inflating
 * cash flow for any month with that activity (see sync.ts's
 * plaidTransactionType() comment for the full story).
 *
 * /transactions/sync's cursor can't re-serve already-acknowledged
 * transactions, so this uses the older /transactions/get instead, which
 * takes a plain date range — the only way left to re-fetch categories
 * for transactions already synced. Same CRON_SECRET bearer auth as
 * sync-all (this route reaches real production Plaid + Supabase
 * credentials that only exist inside Vercel's own runtime — pulling
 * them out via `vercel env pull` doesn't work for Sensitive env vars by
 * design, which is what forced this to be a route instead of a local
 * script).
 *
 * Defaults to a dry run — ?apply=true is required to actually write.
 * Never touches userEdited rows, non-Plaid transactions, or rows
 * already typed transfer/payment/refund.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    console.error("plaid/backfill-transaction-types called in production without CRON_SECRET configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "true";

  const admin = getSupabaseAdminClient();
  const plaidClient = getPlaidClient();

  const { data: items, error: itemsError } = await admin.from("plaid_items").select("id, household_id, access_token, status").eq("status", "active");
  if (itemsError) {
    console.error("backfill-transaction-types: couldn't list plaid_items:", itemsError);
    return NextResponse.json({ error: "Couldn't list Plaid items." }, { status: 500 });
  }

  const perItem: Array<{
    itemId: string;
    householdId: string;
    fetchedCategories: number;
    candidates: number;
    changed: number;
    changes: Array<{ id: string; occurredAt: string; merchant: string | null; amount: number; from: string; to: string; category: string | null }>;
  }> = [];

  for (const item of items ?? []) {
    const categoryByTxnId = new Map<string, string | null>();
    let offset = 0;
    let total = Infinity;
    // Plaid clamps start_date to whatever history it actually has — no
    // need to know the real earliest date up front.
    const startDate = "2000-01-01";
    const endDate = new Date().toISOString().slice(0, 10);

    while (offset < total) {
      const response = await plaidClient.transactionsGet({
        access_token: item.access_token,
        start_date: startDate,
        end_date: endDate,
        options: { count: 500, offset, include_personal_finance_category: true },
      });
      total = response.data.total_transactions;
      for (const t of response.data.transactions as PlaidTransaction[]) {
        categoryByTxnId.set(t.transaction_id, t.personal_finance_category?.primary ?? null);
      }
      offset += response.data.transactions.length;
      if (response.data.transactions.length === 0) break; // safety net against a stuck loop
    }

    const { data: accountRows } = await admin.from("accounts").select("id").eq("household_id", item.household_id);
    const accountIds = (accountRows ?? []).map((a) => a.id as string);

    const itemResult = {
      itemId: item.id as string,
      householdId: item.household_id as string,
      fetchedCategories: categoryByTxnId.size,
      candidates: 0,
      changed: 0,
      changes: [] as (typeof perItem)[number]["changes"],
    };

    if (accountIds.length > 0) {
      const { data: txnRows, error: txnError } = await admin
        .from("transactions")
        .select("id, plaid_transaction_id, amount, type, merchant, occurred_at")
        .in("account_id", accountIds)
        .eq("source", "plaid")
        .in("type", ["income", "expense"])
        .eq("user_edited", false)
        .is("trashed_at", null);
      if (txnError) {
        console.error(`backfill-transaction-types: couldn't list transactions for item ${item.id}:`, txnError);
      } else {
        itemResult.candidates = (txnRows ?? []).length;
        for (const row of txnRows ?? []) {
          if (!row.plaid_transaction_id) continue;
          const category = categoryByTxnId.get(row.plaid_transaction_id);
          if (category === undefined) continue; // Plaid no longer reports this one — leave it alone rather than guess
          // row.amount is already in Shohaz's signed convention (set via
          // toShohazAmount at insert time) — plaidTransactionType only
          // needs a signed amount plus the category, so pass it straight
          // through rather than round-tripping through toShohazAmount
          // again.
          const syntheticPt = { personal_finance_category: { primary: category ?? "", detailed: "", confidence_level: "UNKNOWN" } } as PlaidTransaction;
          const newType = plaidTransactionType(syntheticPt, row.amount);
          if (newType === row.type) continue;

          itemResult.changed++;
          itemResult.changes.push({
            id: row.id,
            occurredAt: row.occurred_at,
            merchant: row.merchant,
            amount: row.amount,
            from: row.type,
            to: newType,
            category,
          });
          if (apply) {
            const { error: updateError } = await admin.from("transactions").update({ type: newType }).eq("id", row.id);
            if (updateError) console.error(`backfill-transaction-types: couldn't update transaction ${row.id}:`, updateError);
          }
        }
      }
    }

    perItem.push(itemResult);
  }

  const totalChanged = perItem.reduce((sum, r) => sum + r.changed, 0);
  const totalCandidates = perItem.reduce((sum, r) => sum + r.candidates, 0);

  return NextResponse.json({ apply, totalCandidates, totalChanged, items: perItem });
}

// Not a real recurring cron (see the file-level comment) — this alias only
// exists so `vercel crons run` can trigger it on demand, the one
// mechanism that reaches CRON_SECRET (a Sensitive env var, unreadable
// outside Vercel's own runtime — see the file-level comment) without
// ever needing to know its value. GET, not POST, since that's what
// `vercel crons run` / Vercel's own scheduler sends, same as sync-all.
export const GET = POST;
