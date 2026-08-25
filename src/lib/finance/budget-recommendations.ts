import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only AI budget-target suggestion (Budgeting v2, "AI Budget
// Recommendations" — user's explicit choice: LLM-narrated, not pure
// deterministic math). Sibling to categorize.ts — same Gateway-routed
// primary/fallback reliability engineering, same reason to reuse the
// same two "provider/model" strings rather than adding a third model to
// the app's Gateway bill. The underlying numbers (trailing average spend,
// most-recent-month spend) are computed deterministically client-side by
// lib/selectors.ts's trailingCategorySpend() and handed in as hard facts
// — the model explains/rounds a target, it never invents the history
// it's reasoning about.

const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 30_000;
const CALL_MAX_RETRIES = 0;

export interface BudgetRecommendationInput {
  categoryId: string;
  name: string;
  trailingAvgSpend: number;
  mostRecentMonthSpend: number;
}

export interface BudgetRecommendation {
  categoryId: string;
  /** Always one of the ids passed in via `categories` — the model is constrained to this household's real, currently-unbudgeted categories and can never invent one. */
  suggestedAmount: number;
  reasoning: string;
}

function buildSchema(categoryIds: [string, ...string[]]) {
  return z.object({
    suggestions: z.array(
      z.object({
        categoryId: z.enum(categoryIds).describe("Echo back exactly one of the category ids from the list below — do not alter it."),
        suggestedAmount: z.number().positive().describe("A sensible monthly budget target in dollars, informed by the trailing average and most-recent-month figures given — round to a sensible number (nearest $5 or $10), don't just restate the average verbatim."),
        reasoning: z.string().max(140).describe("One short, plain-English sentence explaining the suggestion — no more than ~140 characters, no markdown."),
      })
    ),
  });
}

function describeCategory(c: BudgetRecommendationInput): string {
  return `- id=${c.categoryId}: "${c.name}" — trailing 3-month average $${c.trailingAvgSpend.toFixed(2)}/mo, most recent month $${c.mostRecentMonthSpend.toFixed(2)}`;
}

function buildMessages(categories: BudgetRecommendationInput[]): ModelMessage[] {
  const categoryList = categories.map(describeCategory).join("\n");
  return [
    {
      role: "user",
      content:
        "You are suggesting monthly budget targets for a household's spending categories, based ONLY on the real spend history given below — never invent a number that isn't grounded in it. " +
        "For each category, suggest a sensible monthly $ target (a smoothed, sensible figure informed by the trailing average and the most recent month — not necessarily identical to either) " +
        "and one short, plain, encouraging sentence explaining why. Choose ONLY from the category ids given — never invent a category name or id.\n\n" +
        `Categories:\n${categoryList}\n\n` +
        "Return exactly one suggestion per category, echoing back its exact id.",
    },
  ];
}

async function runRecommendation(model: LanguageModel, categories: BudgetRecommendationInput[]): Promise<BudgetRecommendation[]> {
  const categoryIds = categories.map((c) => c.categoryId) as [string, ...string[]];
  const { output } = await generateText({
    model,
    output: Output.object({ schema: buildSchema(categoryIds) }),
    messages: buildMessages(categories),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output.suggestions;
}

/**
 * Suggests a monthly budget target + one-line reasoning for each
 * currently-unbudgeted category with real spend history, in one batched
 * call. Primary model tried first; on any failure, falls back to a cheap
 * OpenAI model once before giving up — same shape as
 * suggestTransactionCategories in categorize.ts.
 *
 * Returns at most one result per input category — the model is asked to
 * echo category ids back, but nothing guarantees it covers every one, so
 * the raw output is reconciled against the input list: anything for an
 * unknown id is dropped, and a category the model silently skipped is
 * just omitted (unlike categorize.ts, there's no sensible null/0
 * fallback to synthesize for "no recommendation" — the caller shows
 * exactly what came back).
 */
export async function suggestBudgetAmounts(categories: BudgetRecommendationInput[]): Promise<BudgetRecommendation[]> {
  if (categories.length === 0) return [];

  let raw: BudgetRecommendation[];
  try {
    raw = await runRecommendation(PRIMARY_MODEL, categories);
  } catch (primaryError) {
    console.error("Primary budget-recommendation model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      raw = await runRecommendation(FALLBACK_MODEL, categories);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (budget recommendations):`, fallbackError);
      throw fallbackError;
    }
  }

  const categoryIdSet = new Set(categories.map((c) => c.categoryId));
  const byId = new Map<string, BudgetRecommendation>();
  for (const s of raw) {
    if (!categoryIdSet.has(s.categoryId)) continue;
    byId.set(s.categoryId, s);
  }
  return categories.map((c) => byId.get(c.categoryId)).filter((s): s is BudgetRecommendation => s !== undefined);
}
