import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only AI duplicate-transaction matching (Duplicate-transaction
// prevention plan, part B) — a fallback, not the primary mechanism. The
// primary mechanism is deterministic (findDuplicateTransaction in
// csv-import-resolution.ts, with a tolerant amount option): same account,
// ±2 days, amount within tolerance, description similarity >= 0.8. This
// only ever fires when that deterministic pass finds nothing but a
// *looser* secondary scan turns up a handful of "maybe" candidates —
// exactly the case an LLM is actually good at (matching "STARBUCKS #4021
// SEATTLE WA" against "Starbucks Coffee" the way a person would) and a
// plain token-overlap score isn't. Same Gateway-routed primary/fallback
// reliability engineering as categorize.ts/budget-recommendations.ts, same
// two model strings — no reason to add a third model to the app's Gateway
// bill for one more text-reasoning task both of these already handle.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 20_000;
const CALL_MAX_RETRIES = 0;

export interface MatchCandidateTransaction {
  id: string;
  merchant: string;
  /** Signed, same convention as Transaction.amount: negative = money out, positive = money in. */
  amount: number;
  occurredAt: string;
}

export interface MatchTransactionInput {
  merchant: string;
  amount: number;
  occurredAt: string;
}

export interface MatchTransactionResult {
  /** Always one of the ids passed in via `options`, or null — the model is constrained to this household's real candidate list and can never invent one. */
  matchedTransactionId: string | null;
  confidence: number; // 0-1
  reasoning: string;
}

function buildSchema(optionIds: [string, ...string[]]) {
  return z.object({
    matchedTransactionId: z
      .enum(optionIds)
      .nullable()
      .describe("The id of the one candidate that's almost certainly the same real-world charge as the new transaction, or null if none of them plausibly are. Never a merchant name, and never anything outside this id list."),
    confidence: z.number().min(0).max(1).describe("How confident you are, 0-1 — low if it's a coincidental match (same amount, different-sounding merchant) rather than clearly the same purchase."),
    reasoning: z.string().max(160).describe("One short, plain-English sentence explaining the judgment — no markdown, no more than ~160 characters. Named for display to the person reviewing it, so make it concrete (mention the merchant names and amounts being compared)."),
  });
}

function describeTransaction(t: MatchCandidateTransaction | MatchTransactionInput, id?: string): string {
  const amountLabel = `$${Math.abs(t.amount).toFixed(2)}`;
  const direction = t.amount < 0 ? "charge" : "credit";
  return `${id ? `- id=${id}: ` : ""}"${t.merchant}" (${amountLabel} ${direction}, ${t.occurredAt})`;
}

function buildMessages(candidate: MatchTransactionInput, options: MatchCandidateTransaction[]): ModelMessage[] {
  const optionList = options.map((o) => describeTransaction(o, o.id)).join("\n");
  return [
    {
      role: "user",
      content:
        "A household scanned a receipt, creating a new transaction record. Before saving it, we're checking whether it's actually a duplicate of a transaction their bank already reported — the same real-world purchase counted twice, which would double-count their spending. " +
        "Given the new (receipt-scanned) transaction and a short list of already-existing candidates on the same account within a few days, decide whether exactly ONE of the candidates is almost certainly the same purchase (allowing for normal drift: a tip added after the receipt was scanned, a slightly different merchant name string, a rounding difference) — or whether none of them clearly are (a similar amount at a different store is NOT a match; be conservative, a wrong match is worse than a missed one).\n\n" +
        `New transaction:\n${describeTransaction(candidate)}\n\n` +
        `Candidates:\n${optionList}\n\n` +
        "Return your judgment about exactly one best candidate id, or null.",
    },
  ];
}

async function runMatch(model: LanguageModel, candidate: MatchTransactionInput, options: MatchCandidateTransaction[]): Promise<MatchTransactionResult> {
  const optionIds = options.map((o) => o.id) as [string, ...string[]];
  const { output } = await generateText({
    model,
    output: Output.object({ schema: buildSchema(optionIds) }),
    messages: buildMessages(candidate, options),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output;
}

/**
 * Asks whether a receipt-scanned transaction is likely a duplicate of one
 * of a short list of already-existing candidates. Primary model tried
 * first; on any failure, falls back to a cheap OpenAI model once before
 * giving up — same shape as suggestTransactionCategories/
 * suggestBudgetAmounts. Returns null (not a low-confidence result) if
 * `options` is empty — nothing to judge.
 *
 * The caller (the receipt-review flow) never merges anything based on
 * this alone — a returned match still surfaces the same human-confirmed
 * "attach to this transaction?" prompt the deterministic path uses, just
 * with this result's `reasoning` as the explanation. Reconciled against
 * the input list the same way categorize.ts reconciles its own output:
 * an id outside `options` is dropped defensively even though the schema
 * already constrains it.
 */
export async function matchTransactionCandidate(candidate: MatchTransactionInput, options: MatchCandidateTransaction[]): Promise<MatchTransactionResult | null> {
  if (options.length === 0) return null;

  let result: MatchTransactionResult;
  try {
    result = await runMatch(PRIMARY_MODEL, candidate, options);
  } catch (primaryError) {
    console.error("Primary transaction-match model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      result = await runMatch(FALLBACK_MODEL, candidate, options);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (transaction match):`, fallbackError);
      throw fallbackError;
    }
  }

  if (result.matchedTransactionId !== null && !options.some((o) => o.id === result.matchedTransactionId)) {
    return { matchedTransactionId: null, confidence: 0, reasoning: "" };
  }
  return result;
}
