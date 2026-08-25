import { NextResponse } from "next/server";
import { suggestBudgetAmounts, type BudgetRecommendationInput } from "@/lib/finance/budget-recommendations";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

function isValidCategory(c: unknown): c is BudgetRecommendationInput {
  if (!c || typeof c !== "object") return false;
  const r = c as Record<string, unknown>;
  return typeof r.categoryId === "string" && r.categoryId.length > 0 && typeof r.name === "string" && typeof r.trailingAvgSpend === "number" && typeof r.mostRecentMonthSpend === "number";
}

// A generous but real cap — same reasoning as categorize/route.ts's
// MAX_TRANSACTIONS: this route's only caller (budget-recommendations-
// card.tsx) already only ever sends currently-unbudgeted categories with
// real spend history, which in practice is a small list, but the cap
// lives here too so the route itself can't be made to kick off an
// unbounded model call.
const MAX_CATEGORIES = 30;

// AI budget-target suggestion (Budgeting v2, "AI Budget Recommendations").
// Pure text/numbers reasoning, not vision — trailing spend figures in
// (already computed client-side by trailingCategorySpend(), which is
// already RLS-scoped since it runs over the caller's own store data), a
// suggested $ target + one-line reasoning back out. Same Gateway-routed
// primary+fallback reliability engineering as /api/v1/finance/categorize.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { categories } = (body ?? {}) as { categories?: unknown };

  if (!Array.isArray(categories) || categories.length === 0 || !categories.every(isValidCategory)) {
    return NextResponse.json({ error: "`categories` must be a non-empty array of { categoryId, name, trailingAvgSpend, mostRecentMonthSpend }." }, { status: 400 });
  }
  if (categories.length > MAX_CATEGORIES) {
    return NextResponse.json({ error: `Too many categories in one request (max ${MAX_CATEGORIES}).` }, { status: 400 });
  }

  try {
    const suggestions = await suggestBudgetAmounts(categories);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Budget recommendation failed:", error);
    const status = upstreamStatusCode(error);
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't get recommendations. Please try again.", retryable: true }, { status: 502 });
  }
}
