import { NextResponse } from "next/server";
import { classifySubscriptions, type ClassifyBillInput } from "@/lib/finance/classify-subscriptions";
import { upstreamStatusCode } from "@/lib/upstream-error";
import { rateLimitGate } from "@/lib/rate-limit";

export const runtime = "nodejs";

function isValidBill(b: unknown): b is ClassifyBillInput {
  if (!b || typeof b !== "object") return false;
  const r = b as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.name === "string" && typeof r.frequency === "string" && typeof r.expectedAmount === "number";
}

// Same generous-but-real cap reasoning as /api/v1/finance/categorize —
// this route's only caller (Recurring Bills' "Classify with AI") already
// scopes to one household's own non-debt-payment bills, which realistically
// never approaches this, but the limit lives here too so the route itself
// can't be made to kick off an unbounded model call.
const MAX_BILLS = 60;

// AI subscription classification for recurring bills. Pure text
// classification, not vision — name/frequency/amount in, a boolean back
// out. Same Gateway-routed primary+fallback reliability engineering as
// /api/v1/finance/categorize, via lib/finance/classify-subscriptions.ts.
// Same rate-limiting reasoning as the other finance-AI routes
// (docs/Rate Limiting Addendum.md).
export async function POST(request: Request) {
  const gate = await rateLimitGate("finance-ai");
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { bills } = (body ?? {}) as { bills?: unknown };

  if (!Array.isArray(bills) || bills.length === 0 || !bills.every(isValidBill)) {
    return NextResponse.json({ error: "`bills` must be a non-empty array of { id, name, frequency, expectedAmount }." }, { status: 400 });
  }
  if (bills.length > MAX_BILLS) {
    return NextResponse.json({ error: `Too many bills in one request (max ${MAX_BILLS}).` }, { status: 400 });
  }

  try {
    const classifications = await classifySubscriptions(bills);
    return NextResponse.json({ classifications });
  } catch (error) {
    console.error("Subscription classification failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't classify subscriptions. Please try again.", retryable: true }, { status: 502 });
  }
}
