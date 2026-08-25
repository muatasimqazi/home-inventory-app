import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { TRASH_RETENTION_DAYS } from "@/lib/types";

export const runtime = "nodejs";

function purgeAfter(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
  return d.toISOString();
}

/**
 * One-off, temporary — NOT wired into vercel.json crons. Trashes exactly
 * the transaction ids passed in the body (never auto-derived/re-scanned
 * here) — same trashed_at/permanently_delete_after/updated_at shape
 * updateTransaction's own trashTransaction uses client-side, just via
 * the admin client since this runs with no user session. Recoverable
 * (Trash, 30-day retention), not a hard delete. Removed once this
 * specific cleanup (the two confirmed duplicates diagnose-duplicates
 * found) is done.
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const { transactionIds } = (body ?? {}) as { transactionIds?: unknown };
  if (!Array.isArray(transactionIds) || transactionIds.length === 0 || !transactionIds.every((id) => typeof id === "string")) {
    return NextResponse.json({ error: "`transactionIds` must be a non-empty array of strings." }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const now = new Date();
  const { data, error } = await admin
    .from("transactions")
    .update({ trashed_at: now.toISOString(), permanently_delete_after: purgeAfter(now), updated_at: now.toISOString() })
    .in("id", transactionIds)
    .is("trashed_at", null)
    .select("id, merchant, amount, occurred_at");

  if (error) {
    console.error("trash-duplicate-transactions: update failed:", error);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }

  return NextResponse.json({ trashed: data });
}
