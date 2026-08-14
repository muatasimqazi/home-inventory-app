import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { CATEGORIES } from "@/lib/types";

// Server-only vision implementation of item detection from photos. The
// `server-only` import makes an accidental client-component import of this
// module a build error — GEMINI_API_KEY must never reach the browser.
//
// This is the active implementation (see lib/ai.ts's `visionProvider`),
// called via /api/v1/vision/detect rather than imported directly by any
// client component.

const GEMINI_MODEL = "gemini-flash-latest";

// Only used when Gemini itself fails (e.g. the provider-wide "high demand"
// 503 this was added for) — a plain "provider/model" string routes through
// Vercel AI Gateway automatically (no @ai-sdk/gateway package needed), using
// whatever Gateway credentials/OIDC the project already has. Picked as the
// cheapest current vision-capable OpenAI model, since it only ever runs as
// a fallback, not as the primary detector.
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const detectionSchema = z.object({
  items: z.array(
    z.object({
      suggestedName: z.string().describe("A concise, human-readable name for the item, e.g. 'Cordless Drill'."),
      category: z.enum([...CATEGORIES] as [string, ...string[]]),
      suggestedTags: z.array(z.string()).describe("0-3 short lowercase tags, e.g. 'power-tools'."),
      confidence: z.number().min(0).max(1).describe("How confident you are in the identification, 0-1."),
      photoEmoji: z.string().describe("A single emoji that best represents this item."),
    })
  ),
});

export type GeminiDetectedItem = z.infer<typeof detectionSchema>["items"][number];

function google() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return createGoogleGenerativeAI({ apiKey });
}

function buildMessages(photos: string[]): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "You are cataloging items for a home inventory app. Identify every distinct physical " +
            "item visible across these photo(s). For each item, pick the category from the allowed " +
            "list that fits best, suggest a couple of short lowercase tags if relevant, and give an " +
            "honest confidence score — use a lower score for anything ambiguous, partially obscured, " +
            "or generic-looking rather than guessing.",
        },
        ...photos.map((photo) => ({ type: "file" as const, mediaType: "image" as const, data: photo })),
      ],
    },
  ];
}

async function runDetection(model: LanguageModel, photos: string[]): Promise<GeminiDetectedItem[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: detectionSchema }),
    messages: buildMessages(photos),
  });
  return output.items;
}

/**
 * Detects items across one or more photos in a single call. Photos are data
 * URLs (e.g. from a camera capture), passed inline — no persistent file
 * upload needed for this one-shot use case.
 *
 * Gemini is the primary model; if it fails for any reason (its own retries
 * already exhausted — see the AI SDK's default maxRetries), this falls back
 * to a cheap OpenAI model via AI Gateway once before giving up, so a
 * provider-wide Gemini outage doesn't block detection entirely.
 */
export async function detectItemsWithGemini(photos: string[]): Promise<GeminiDetectedItem[]> {
  try {
    return await runDetection(google()(GEMINI_MODEL), photos);
  } catch (geminiError) {
    console.error("Gemini vision detection failed, falling back to", FALLBACK_MODEL, geminiError);
    try {
      return await runDetection(FALLBACK_MODEL, photos);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      // Surface the fallback's error — it's the one that actually ended the
      // attempt. The API route's status-code handling treats a 503/429 from
      // either provider as the same "high demand" case, so which one
      // surfaces rarely matters for the message the user sees; the Gemini
      // error is still logged above for debugging.
      throw fallbackError;
    }
  }
}
