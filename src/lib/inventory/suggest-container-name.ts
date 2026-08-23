import "server-only";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";

// AI container-label suggestion — a pure text task (a container's current
// item names in, a short name AND a content-derived Container-ID prefix
// out), same "Gateway-routed primary+fallback, bounded timeout, single
// retry-via-fallback" reliability shape as every other AI call in this app
// (lib/vision/detect.ts, lib/finance/categorize.ts, lib/ask/ask.ts).
//
// Both fields come from one model call, not two: they're derived from the
// exact same input (the container's contents), so a second round trip for
// the prefix alone would just double latency/cost for no real benefit.
// Structured output (Output.object + Zod, same pattern lib/vision/
// detect.ts already uses) rather than plain text, since two distinct
// fields need to come back reliably parsed.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 15_000;
const CALL_MAX_RETRIES = 0;

const labelSchema = z.object({
  name: z
    .string()
    .describe("A short, natural label for the container, 1-4 words, title case, no punctuation. E.g. 'Winter Clothes', 'Hand Tools'."),
  codePrefix: z
    .string()
    .describe(
      "A short, uppercase, letters-only prefix (2-8 characters, no numbers/spaces/punctuation) derived from the container's " +
        "contents, suitable as the prefix of a printable Container ID — e.g. 'TOOLS' for a mix of hand tools, 'XMAS' for holiday " +
        "decorations, 'CRAFT' for craft supplies. Prefer a recognizable whole word or clear abbreviation over an arbitrary " +
        "truncation."
    ),
});

export interface ContainerLabelSuggestion {
  name: string;
  /** Cleaned (uppercase, letters-only) but NOT yet combined with a sequence number — callers pair this with nextDisplayCodeForPrefix() (lib/display-code.ts) for the actual Container ID, same numbering scheme every other display-code path already uses. */
  codePrefix: string;
}

function buildPrompt(itemNames: string[]): string {
  return (
    "A physical storage container (a bin, box, drawer, tote, or shelf) holds these items: " +
    itemNames.join(", ") +
    ". Suggest a short label for it and a short uppercase prefix for its printable Container ID, both based on what's actually " +
    "inside."
  );
}

/** Strips wrapping quotes/stray whitespace a model sometimes adds to the name despite the schema's own instructions — never trust free text verbatim. codePrefix's own cleanup lives in lib/display-code.ts's normalizeCodePrefix(), reused by every prefix source, not just this one. */
function cleanName(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function runSuggest(model: LanguageModel, itemNames: string[]): Promise<{ name: string; rawCodePrefix: string }> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: labelSchema }),
    prompt: buildPrompt(itemNames),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return { name: cleanName(output.name), rawCodePrefix: output.codePrefix };
}

/**
 * Suggests a short label and a content-derived Container-ID prefix for a
 * container, based on the names of items currently in it. Primary model
 * tried first; on any failure, falls back to a cheap OpenAI model once —
 * same reasoning as detectItems() in lib/vision/detect.ts. Never invents
 * item names of its own — `itemNames` is the household's own real data,
 * passed in by the caller. The caller is responsible for cleaning
 * `rawCodePrefix` via normalizeCodePrefix() before using it (kept there,
 * not here, since that helper is shared with every other display-code
 * source and lives alongside them in lib/display-code.ts).
 */
export async function suggestContainerLabel(itemNames: string[]): Promise<{ name: string; rawCodePrefix: string }> {
  try {
    return await runSuggest(PRIMARY_MODEL, itemNames);
  } catch (primaryError) {
    console.error("Primary container-label model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runSuggest(FALLBACK_MODEL, itemNames);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
