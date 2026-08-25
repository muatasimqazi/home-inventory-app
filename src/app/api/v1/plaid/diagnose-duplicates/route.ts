import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Read-only, temporary diagnostic — NOT wired into vercel.json crons,
 * makes no writes at all. Finds candidate duplicate Plaid transactions
 * (same household+account+amount, within a few days of each other,
 * distinct plaid_transaction_id — the exact shape the missing exact-id
 * dedup check earlier today would have let through) so we can look at
 * real data before touching anything. Removed once we're done looking,
 * same as backfill-transaction-types earlier today.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !cronSecret) {
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const admin = getSupabaseAdminClient();

  const [{ data: rows, error: queryError }, { data: categoryRows }] = await Promise.all([
    admin
      .from("transactions")
      .select("id, household_id, account_id, occurred_at, merchant, description, amount, plaid_transaction_id, category_id, type")
      .eq("source", "plaid")
      .is("trashed_at", null),
    admin.from("categories").select("id, name"),
  ]);
  if (queryError) {
    console.error("diagnose-duplicates: query failed:", queryError);
    return NextResponse.json({ error: "Query failed." }, { status: 500 });
  }

  const categoryNameById = new Map((categoryRows ?? []).map((c) => [c.id as string, c.name as string]));

  type Row = NonNullable<typeof rows>[number];
  const groups = new Map<string, Row[]>();
  for (const r of rows ?? []) {
    const key = `${r.household_id}:${r.account_id}:${r.amount}`;
    const existing = groups.get(key);
    if (existing) existing.push(r);
    else groups.set(key, [r]);
  }

  const candidates: {
    accountId: string;
    amount: number;
    rows: { id: string; occurredAt: string; merchant: string | null; description: string | null; plaidTransactionId: string | null; category: string | null; type: string }[];
  }[] = [];

  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
    const used = new Set<string>();
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].id)) continue;
      const cluster = [sorted[i]];
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].id)) continue;
        const days = (new Date(sorted[j].occurred_at).getTime() - new Date(sorted[i].occurred_at).getTime()) / 86400000;
        if (days > 3) break; // sorted by date — nothing further out is closer
        if (sorted[j].plaid_transaction_id !== sorted[i].plaid_transaction_id) cluster.push(sorted[j]);
      }
      if (cluster.length > 1) {
        for (const c of cluster) used.add(c.id);
        candidates.push({
          accountId: sorted[i].account_id,
          amount: sorted[i].amount,
          rows: cluster.map((c) => ({
            id: c.id,
            occurredAt: c.occurred_at,
            merchant: c.merchant,
            description: c.description,
            plaidTransactionId: c.plaid_transaction_id,
            category: c.category_id ? (categoryNameById.get(c.category_id) ?? null) : null,
            type: c.type,
          })),
        });
      }
    }
  }

  return NextResponse.json({ candidateGroups: candidates.length, candidates });
}

export const GET = POST;
