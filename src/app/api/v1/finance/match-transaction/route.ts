import { NextResponse } from "next/server";
import { matchTransactionCandidate, type MatchCandidateTransaction, type MatchTransactionInput } from "@/lib/finance/match-transaction";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

function isValidCandidate(t: unknown): t is MatchCandidateTransaction {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.merchant === "string" && typeof r.amount === "number" && typeof r.occurredAt === "string";
}

function isValidTransaction(t: unknown): t is MatchTransactionInput {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return typeof r.merchant === "string" && typeof r.amount === "number" && typeof r.occurredAt === "string";
}

// A generous but real cap — this route's only caller (the receipt-review
// flow's duplicate check) already only sends a short "maybe" candidate
// list from a narrow window, but the limit lives here too so the route
// itself can't be made to kick off an unbounded model call.
const MAX_OPTIONS = 10;

// AI duplicate-transaction match fallback (Duplicate-transaction
// prevention plan, part B) — see lib/finance/match-transaction.ts's own
// doc comment for when/why this fires. Pure text/numbers reasoning, not
// vision — candidates come from the client, already RLS-scoped in the
// store, same as /api/v1/finance/categorize.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { transaction, options } = (body ?? {}) as { transaction?: unknown; options?: unknown };

  if (!isValidTransaction(transaction)) {
    return NextResponse.json({ error: "`transaction` must be { merchant, amount, occurredAt }." }, { status: 400 });
  }
  if (!Array.isArray(options) || options.length === 0 || !options.every(isValidCandidate)) {
    return NextResponse.json({ error: "`options` must be a non-empty array of { id, merchant, amount, occurredAt }." }, { status: 400 });
  }
  if (options.length > MAX_OPTIONS) {
    return NextResponse.json({ error: `Too many candidates in one request (max ${MAX_OPTIONS}).` }, { status: 400 });
  }

  try {
    const result = await matchTransactionCandidate(transaction, options);
    return NextResponse.json({ result });
  } catch (error) {
    console.error("Transaction match failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't check for a matching transaction. Please try again.", retryable: true }, { status: 502 });
  }
}
