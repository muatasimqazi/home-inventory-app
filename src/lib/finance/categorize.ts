import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only AI category suggestion for transactions (Household Ledger
// Implementation Plan, Workstream 3 batch). Sibling to lib/vision/detect.ts
// — same Gateway-routed primary/fallback reliability engineering (bounded
// timeout, single retry via a different model, no SDK-internal retry) —
// but a pure text classification task, not vision: no photo ever crosses
// this boundary, just merchant/description/amount in and a categoryId back
// out. Called via /api/v1/finance/categorize rather than imported directly
// by any client component (see lib/ai.ts's `categorizationProvider`).
//
// Deliberately the same two "provider/model" strings as detect.ts (both
// already routed through Vercel AI Gateway) rather than picking new ones —
// no reason to add a third model to the app's Gateway bill for a task both
// of these already handle fine, and it keeps the fallback behavior
// (provider-wide outage on one side doesn't block the feature) consistent
// with every other AI capability in the app.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 30_000;
const CALL_MAX_RETRIES = 0;

export interface CategorizeTransactionInput {
  id: string;
  merchant: string | null;
  description: string | null;
  /** Signed, same convention as Transaction.amount: negative = money out, positive = money in. */
  amount: number;
}

export interface CategorizeCategoryOption {
  id: string;
  name: string;
}

export interface CategorySuggestionResult {
  transactionId: string;
  /** Always one of the ids passed in via `categories`, or null — the model is constrained to this household's real category list and can never invent a name. */
  categoryId: string | null;
  confidence: number; // 0-1
}

function buildSchema(categoryIds: [string, ...string[]]) {
  return z.object({
    suggestions: z.array(
      z.object({
        transactionId: z.string().describe("Echo back exactly one of the transaction ids from the list below — do not alter it."),
        categoryId: z
          .enum(categoryIds)
          .nullable()
          .describe(
            "The id of the single best-matching category from the provided list, or null if nothing on the list reasonably fits. Never a category name, and never anything outside this id list."
          ),
        confidence: z.number().min(0).max(1).describe("How confident you are this category is right, 0-1 — lower for a generic or ambiguous merchant name."),
      })
    ),
  });
}

function describeTransaction(t: CategorizeTransactionInput): string {
  const direction = t.amount < 0 ? "charge" : "credit";
  const amountLabel = `$${Math.abs(t.amount).toFixed(2)}`;
  const label = t.merchant?.trim() || t.description?.trim() || "(no merchant or description)";
  const extra = t.description && t.merchant && t.description.trim() !== t.merchant.trim() ? ` — notes: "${t.description}"` : "";
  return `- id=${t.id}: "${label}" (${amountLabel} ${direction})${extra}`;
}

function buildMessages(transactions: CategorizeTransactionInput[], categories: CategorizeCategoryOption[]): ModelMessage[] {
  const categoryList = categories.map((c) => `- id=${c.id}: ${c.name}`).join("\n");
  const transactionList = transactions.map(describeTransaction).join("\n");
  return [
    {
      role: "user",
      content:
        "You are categorizing personal-finance transactions for a household budgeting app. For each transaction below, " +
        "pick the single best-fitting category, choosing ONLY from this household's real category list (by id) — never " +
        "invent a category name or id that isn't in the list. If nothing on the list reasonably fits, use categoryId " +
        "null instead of forcing a bad guess. Give an honest confidence score, lower for anything ambiguous (a generic " +
        "merchant name, or one that could plausibly belong to more than one category).\n\n" +
        `Categories:\n${categoryList}\n\n` +
        `Transactions:\n${transactionList}\n\n` +
        "Return exactly one suggestion per transaction, echoing back its exact id.",
    },
  ];
}

async function runCategorization(
  model: LanguageModel,
  transactions: CategorizeTransactionInput[],
  categories: CategorizeCategoryOption[]
): Promise<CategorySuggestionResult[]> {
  const categoryIds = categories.map((c) => c.id) as [string, ...string[]];
  const { output } = await generateText({
    model,
    output: Output.object({ schema: buildSchema(categoryIds) }),
    messages: buildMessages(transactions, categories),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output.suggestions;
}

/**
 * Suggests a best-fit category (from this household's real, active
 * category list) for each transaction, in one batched call. The primary
 * model is tried first; on any failure this falls back to a cheap OpenAI
 * model once before giving up — same shape as detectItems in
 * lib/vision/detect.ts.
 *
 * Returns exactly one result per input transaction, in the same order —
 * the model is asked to echo transaction ids back, but nothing guarantees
 * it does so faithfully or covers every one, so the raw output is
 * reconciled against the input list before returning: anything for an
 * unknown id or a categoryId outside the given list is dropped, and any
 * transaction the model silently skipped gets a null/0 suggestion instead
 * of being missing from the response entirely.
 */
export async function suggestTransactionCategories(
  transactions: CategorizeTransactionInput[],
  categories: CategorizeCategoryOption[]
): Promise<CategorySuggestionResult[]> {
  if (transactions.length === 0 || categories.length === 0) return [];

  let raw: CategorySuggestionResult[];
  try {
    raw = await runCategorization(PRIMARY_MODEL, transactions, categories);
  } catch (primaryError) {
    console.error("Primary categorization model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      raw = await runCategorization(FALLBACK_MODEL, transactions, categories);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (categorization):`, fallbackError);
      throw fallbackError;
    }
  }

  const knownIds = new Set(transactions.map((t) => t.id));
  const categoryIdSet = new Set(categories.map((c) => c.id));
  const byId = new Map<string, CategorySuggestionResult>();
  for (const s of raw) {
    if (!knownIds.has(s.transactionId)) continue;
    if (s.categoryId !== null && !categoryIdSet.has(s.categoryId)) continue;
    byId.set(s.transactionId, s);
  }
  return transactions.map((t) => byId.get(t.id) ?? { transactionId: t.id, categoryId: null, confidence: 0 });
}
