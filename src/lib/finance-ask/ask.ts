import "server-only";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createFinanceAskTools } from "./tools";

// Same Gateway routing, same primary/fallback pair already proven for
// vision (lib/vision/detect.ts) — this is a text+tool-calling task, not
// vision, but there's no established text-specific pair in this codebase
// yet and no reason to introduce a third model choice for one feature.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// Longer than vision detection's 30s bound (lib/vision/detect.ts) — a
// tool-calling answer can take several model round-trips (decide to call
// searchTransactions, read its result, decide whether to call it again,
// compose the final answer), where vision detection is always exactly one
// call. maxRetries: 0 for the same reason as detect.ts: on failure, move to
// a completely different model rather than the SDK's own same-model
// backoff-retry.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You answer questions about the user's household finances. Today's date is ${today}. ` +
    "Always call searchTransactions to look up real data before answering a question about spending, " +
    "purchases, or transactions — never guess or estimate a number or date from memory. Call it more than " +
    "once if a question genuinely needs more than one search (e.g. comparing two vendors, or narrowing " +
    "an initial search that returned nothing useful). " +
    "Transaction amounts are signed: negative means money spent, positive means money received (income or " +
    "a refund) — describe spending as a positive dollar figure in your answer, don't say 'spent -$40'. " +
    "When summarizing total spend, use the tool's own totalAmount/count fields, which reflect every match — " +
    "never add up only the transactions listed, since the list can be capped short of the true total. " +
    "If nothing matches, say so plainly rather than guessing an answer. " +
    "Keep answers short and direct: state the number, date, or fact first, then at most one sentence of " +
    "relevant context. No preamble, no restating the question."
  );
}

async function runAsk(model: LanguageModel, question: string, supabase: SupabaseClient, householdId: string): Promise<string> {
  const result = await generateText({
    model,
    system: systemPrompt(),
    prompt: question,
    tools: createFinanceAskTools(supabase, householdId),
    stopWhen: stepCountIs(4),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return result.text;
}

/**
 * Answers one natural-language question about the household's finances.
 * Primary model tried first; on any failure, falls back to a cheap OpenAI
 * model once — same reasoning as detectItems() in lib/vision/detect.ts.
 */
export async function askFinanceQuestion(question: string, supabase: SupabaseClient, householdId: string): Promise<string> {
  try {
    return await runAsk(PRIMARY_MODEL, question, supabase, householdId);
  } catch (primaryError) {
    console.error("Primary finance-ask model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runAsk(FALLBACK_MODEL, question, supabase, householdId);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
