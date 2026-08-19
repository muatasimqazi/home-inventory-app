import "server-only";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAskTools } from "./tools";

// Same Gateway routing, same primary/fallback pair already proven for
// vision (lib/vision/detect.ts) — this is a text+tool-calling task, not
// vision, but there's no established text-specific pair in this codebase
// yet and no reason to introduce a third model choice for one feature.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// Longer than vision detection's 30s bound (lib/vision/detect.ts) — a
// tool-calling answer can take several model round-trips (decide to call
// a tool, read its result, decide whether to call another, compose the
// final answer), where vision detection is always exactly one call.
// maxRetries: 0 for the same reason as detect.ts: on failure, move to a
// completely different model rather than the SDK's own same-model
// backoff-retry.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

/** One result card the Ask panel can render inline below the prose answer — an item with its real container/location (and photo, when there is one) or a specific transaction, not just text claiming they exist. */
export interface AskReference {
  kind: "item" | "transaction";
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You answer questions about this household — both its finances and its physical inventory. Today's date is ${today}. ` +
    "Always call a tool to look up real data before answering a question about spending, purchases, transactions, " +
    "or where something is kept — never guess or estimate a number, date, or location from memory. Call a tool " +
    "more than once if a question genuinely needs more than one search (e.g. comparing two vendors, or narrowing " +
    "an initial search that returned nothing useful). " +
    "For 'where is my X' questions, use findInventoryItems and always state the actual container and location by " +
    "name (e.g. 'in the Leather Tools bin, in the Office') — never just 'it's in your inventory.' If nothing " +
    "matches, say so plainly and suggest a different search term rather than guessing. " +
    "Transaction amounts are signed: negative means money spent, positive means money received (income or " +
    "a refund) — describe spending as a positive dollar figure in your answer, don't say 'spent -$40'. " +
    "When summarizing total spend, use searchTransactions' own totalAmount/count fields, which reflect every " +
    "match — never add up only the transactions listed, since the list can be capped short of the true total. " +
    "Keep answers short and direct: state the number, date, or location first, then at most one sentence of " +
    "relevant context. No preamble, no restating the question — the specific item/transaction you found is shown " +
    "separately below your answer, so don't re-describe it in exhaustive detail either."
  );
}

/** Pulls result cards out of what the tools actually returned this turn — not something the model is asked to narrate separately, so it can't drift from what was really found. Capped and deduped; the model may call the same tool more than once while narrowing a search. */
function extractReferences(toolResults: { toolName: string; output: unknown }[]): AskReference[] {
  const refs: AskReference[] = [];

  for (const tr of toolResults) {
    if (tr.toolName === "findInventoryItems") {
      const output = tr.output as { items?: { id: string; name: string; container: string | null; location: string | null; photoUrl: string | null }[] };
      for (const item of output.items ?? []) {
        refs.push({
          kind: "item",
          id: item.id,
          title: item.name,
          subtitle: [item.container, item.location].filter(Boolean).join(" · ") || null,
          imageUrl: item.photoUrl,
          href: `/items/${item.id}`,
        });
      }
    } else if (tr.toolName === "searchTransactions") {
      const output = tr.output as { transactions?: { id: string; merchant: string | null; description: string | null; date: string; matchedItem?: string }[] };
      for (const t of output.transactions ?? []) {
        refs.push({
          kind: "transaction",
          id: t.id,
          title: t.matchedItem ?? t.merchant ?? t.description ?? "Transaction",
          subtitle: t.matchedItem ? (t.merchant ?? null) : null,
          imageUrl: null,
          href: `/finance/transactions?transactionId=${t.id}`,
        });
      }
    }
  }

  const seen = new Set<string>();
  return refs
    .filter((r) => {
      const key = `${r.kind}-${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

interface AskResult {
  text: string;
  references: AskReference[];
}

async function runAsk(model: LanguageModel, question: string, supabase: SupabaseClient, householdId: string): Promise<AskResult> {
  const result = await generateText({
    model,
    system: systemPrompt(),
    prompt: question,
    tools: createAskTools(supabase, householdId),
    stopWhen: stepCountIs(4),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return { text: result.text, references: extractReferences(result.toolResults) };
}

/**
 * Answers one natural-language question about the household — finances or
 * inventory. Primary model tried first; on any failure, falls back to a
 * cheap OpenAI model once — same reasoning as detectItems() in
 * lib/vision/detect.ts.
 */
export async function askQuestion(question: string, supabase: SupabaseClient, householdId: string): Promise<AskResult> {
  try {
    return await runAsk(PRIMARY_MODEL, question, supabase, householdId);
  } catch (primaryError) {
    console.error("Primary ask model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runAsk(FALLBACK_MODEL, question, supabase, householdId);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
