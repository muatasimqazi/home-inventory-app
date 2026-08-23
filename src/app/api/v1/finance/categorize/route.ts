import { NextResponse } from "next/server";
import { suggestTransactionCategories, type CategorizeTransactionInput, type CategorizeCategoryOption } from "@/lib/finance/categorize";
import { upstreamStatusCode } from "@/lib/upstream-error";

export const runtime = "nodejs";

function isValidTransaction(t: unknown): t is CategorizeTransactionInput {
  if (!t || typeof t !== "object") return false;
  const r = t as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    r.id.length > 0 &&
    (r.merchant === null || typeof r.merchant === "string") &&
    (r.description === null || typeof r.description === "string") &&
    typeof r.amount === "number"
  );
}

function isValidCategory(c: unknown): c is CategorizeCategoryOption {
  if (!c || typeof c !== "object") return false;
  const r = c as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 && typeof r.name === "string";
}

// A generous but real cap on one batch — this route only ever has one
// caller today (the transactions list's "Suggest categories" pass, see
// lib/ai.ts's HttpCategorizationProvider), which already caps how many
// uncategorized transactions it sends, but the limit lives here too so the
// route itself can't be made to kick off an unbounded model call.
const MAX_TRANSACTIONS = 60;

// AI category suggestion for transactions (Household Ledger Implementation
// Plan, Workstream 3 batch). Pure text classification, not vision —
// merchant/description/amount in, a suggested categoryId (matched against
// this household's own real, active category list, never invented) back
// out. Same Gateway-routed primary+fallback reliability engineering as
// /api/v1/vision/detect, via lib/finance/categorize.ts's separate
// (non-vision) model-calling code.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { transactions, categories } = (body ?? {}) as { transactions?: unknown; categories?: unknown };

  if (!Array.isArray(transactions) || transactions.length === 0 || !transactions.every(isValidTransaction)) {
    return NextResponse.json({ error: "`transactions` must be a non-empty array of { id, merchant, description, amount }." }, { status: 400 });
  }
  if (!Array.isArray(categories) || !categories.every(isValidCategory)) {
    return NextResponse.json({ error: "`categories` must be an array of { id, name }." }, { status: 400 });
  }
  if (transactions.length > MAX_TRANSACTIONS) {
    return NextResponse.json({ error: `Too many transactions in one request (max ${MAX_TRANSACTIONS}).` }, { status: 400 });
  }

  if (categories.length === 0) {
    // No real category to suggest — every household has at least the
    // shared defaults, so this is a genuinely empty/edge case, not the
    // normal path. Return an honest "nothing to suggest" instead of
    // spending a model call on a request that can't possibly resolve.
    return NextResponse.json({ suggestions: transactions.map((t) => ({ transactionId: t.id, categoryId: null, confidence: 0 })) });
  }

  try {
    const suggestions = await suggestTransactionCategories(transactions, categories);
    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error("Category suggestion failed:", error);
    const status = upstreamStatusCode(error);
    // 503/429 from the model provider itself is transient overload/rate-
    // limiting — same provider-agnostic handling as vision/detect's route.
    if (status === 503 || status === 429) {
      return NextResponse.json(
        { error: "The AI service is experiencing high demand right now. Please try again in a moment.", retryable: true },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "Couldn't suggest categories. Please try again.", retryable: true }, { status: 502 });
  }
}
