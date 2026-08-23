import "server-only";
import { generateText, type LanguageModel } from "ai";

// AI container-name suggestion — a pure text task (a container's current
// item names in, a short label out), same "Gateway-routed primary+fallback,
// bounded timeout, single retry-via-fallback" reliability shape as every
// other AI call in this app (lib/vision/detect.ts, lib/finance/
// categorize.ts, lib/ask/ask.ts), just simple enough not to need its own
// Zod schema — the output is one short string, not structured data.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// Short — this is a one-line text completion, not a multi-step reasoning
// task; if it's not back within a few seconds something's actually wrong,
// not just thinking.
const CALL_TIMEOUT_MS = 15_000;
const CALL_MAX_RETRIES = 0;

function buildPrompt(itemNames: string[]): string {
  return (
    "Suggest a short, natural label for a physical storage container (a bin, box, drawer, tote, or " +
    "shelf) that holds these items: " +
    itemNames.join(", ") +
    ". Reply with ONLY the label itself — 1 to 4 words, title case, no punctuation, no quotes, no " +
    "explanation. Good examples: 'Winter Clothes', 'Hand Tools', 'Holiday Decorations', 'Office " +
    "Supplies', 'Kids Art Supplies'."
  );
}

/** Strips wrapping quotes and stray whitespace/newlines a model sometimes adds despite the "ONLY the label" instruction — never trust free text verbatim. */
function cleanSuggestion(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function runSuggest(model: LanguageModel, itemNames: string[]): Promise<string> {
  const { text } = await generateText({
    model,
    prompt: buildPrompt(itemNames),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return cleanSuggestion(text);
}

/**
 * Suggests a short label for a container based on what's currently inside
 * it. Primary model tried first; on any failure, falls back to a cheap
 * OpenAI model once — same reasoning as detectItems() in lib/vision/detect.ts.
 * Never invents item names of its own — `itemNames` is the household's own
 * real data, passed in by the caller.
 */
export async function suggestContainerName(itemNames: string[]): Promise<string> {
  try {
    return await runSuggest(PRIMARY_MODEL, itemNames);
  } catch (primaryError) {
    console.error("Primary container-naming model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runSuggest(FALLBACK_MODEL, itemNames);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
