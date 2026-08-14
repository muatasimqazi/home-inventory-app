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

const boundingBoxSchema = z
  .object({
    x: z.number().min(0).max(1).describe("Left edge of the box, as a fraction of the photo's width (0 = left edge, 1 = right edge)."),
    y: z.number().min(0).max(1).describe("Top edge of the box, as a fraction of the photo's height (0 = top edge, 1 = bottom edge)."),
    width: z.number().min(0).max(1).describe("Width of the box, as a fraction of the photo's width."),
    height: z.number().min(0).max(1).describe("Height of the box, as a fraction of the photo's height."),
  })
  .nullable()
  .describe(
    "A tight box around just this item within its photo, in normalized 0-1 coordinates. Null if you " +
      "can't confidently localize it — e.g. it's spread across the whole frame, or it's genuinely " +
      "hard to tell where it starts/ends. Don't guess a box you're not fairly sure of."
  );

const detectionSchema = z.object({
  items: z.array(
    z.object({
      suggestedName: z.string().describe("A concise, human-readable name for the item, e.g. 'Cordless Drill'."),
      category: z.enum([...CATEGORIES] as [string, ...string[]]),
      suggestedTags: z.array(z.string()).describe("0-3 short lowercase tags, e.g. 'power-tools'."),
      confidence: z.number().min(0).max(1).describe("How confident you are in the identification, 0-1."),
      photoEmoji: z.string().describe("A single emoji that best represents this item."),
      photoIndex: z.number().int().min(0).describe("0-based index of the labeled photo (Photo 0, Photo 1, ...) this item appears in."),
      boundingBox: boundingBoxSchema,
    })
  ),
});

export type GeminiDetectedItem = z.infer<typeof detectionSchema>["items"][number];

function google() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
  return createGoogleGenerativeAI({ apiKey });
}

// Each photo gets an explicit "Photo N:" label immediately before its file
// part — relying on the model to infer index purely from part order was
// unreliable enough not to trust for something the crop step depends on
// (photoIndex needs to be right, or an item's cover comes from the wrong
// photo entirely).
function buildMessages(photos: string[]): ModelMessage[] {
  const labeledPhotos = photos.flatMap((photo, i) => [
    { type: "text" as const, text: `Photo ${i}:` },
    { type: "file" as const, mediaType: "image" as const, data: photo },
  ]);

  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "You are cataloging items for a home inventory app. Identify every distinct physical " +
            "item visible across these labeled photos. For each item, pick the category from the " +
            "allowed list that fits best, suggest a couple of short lowercase tags if relevant, and " +
            "give an honest confidence score — use a lower score for anything ambiguous, partially " +
            "obscured, or generic-looking rather than guessing.\n\n" +
            "Also report, per item, which labeled photo it's in (photoIndex) and a tight bounding box " +
            "around just that item within that photo — one photo can contain several items (e.g. a " +
            "shelf of tools), and each needs its own box so its cover photo can be cropped to just " +
            "that item instead of the whole shot. See the boundingBox field description for exactly " +
            "when to leave it null instead of guessing.",
        },
        ...labeledPhotos,
      ],
    },
  ];
}

// detectItemsWithGemini can make up to two of these calls back to back
// (primary, then the fallback model) — each needs its own bound or a
// stalled provider (not erroring, just never responding) can run
// unbounded and blow past Vercel's function timeout entirely, which is
// exactly what "Task timed out after 300 seconds" was: no `timeout` was
// set, so a slow/stuck call just sat there, and worst case that could
// happen twice in one request. maxRetries is also trimmed from the SDK's
// default of 2 down to 1 — with two independent models to fall back
// across, retrying the same one 3 times before moving on wastes the time
// budget without meaningfully improving the odds.
const CALL_TIMEOUT_MS = 20_000;
const CALL_MAX_RETRIES = 1;

// gpt-5-nano (and the GPT-5 family generally) reasons by default even for
// a straightforward vision task like this — verified live: the exact same
// detection call took ~11s and burned 1,408 reasoning tokens by default,
// vs ~2s and 0 reasoning tokens with reasoningEffort "minimal", no
// measurable loss in bounding-box accuracy. Left at the default, the
// fallback model itself could occasionally trip CALL_TIMEOUT_MS below —
// the exact "falls back, and the fallback also times out" case this is
// fixing. Gemini has no equivalent option (and doesn't need one here), so
// this is only ever passed for the fallback call.
type DetectionProviderOptions = Parameters<typeof generateText>[0]["providerOptions"];

const FALLBACK_PROVIDER_OPTIONS: DetectionProviderOptions = { openai: { reasoningEffort: "minimal" } };

async function runDetection(model: LanguageModel, photos: string[], providerOptions?: DetectionProviderOptions): Promise<GeminiDetectedItem[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: detectionSchema }),
    messages: buildMessages(photos),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
    providerOptions,
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
 * provider-wide Gemini outage doesn't block detection entirely. Bounding-box
 * localization from the fallback model is expected to be less reliable than
 * Gemini's — that's fine, a missing/invalid box just falls back to the full
 * photo downstream (see cropToItem in lib/crop-image.ts), never a hard error.
 */
export async function detectItemsWithGemini(photos: string[]): Promise<GeminiDetectedItem[]> {
  try {
    return await runDetection(google()(GEMINI_MODEL), photos);
  } catch (geminiError) {
    console.error("Gemini vision detection failed, falling back to", FALLBACK_MODEL, geminiError);
    try {
      return await runDetection(FALLBACK_MODEL, photos, FALLBACK_PROVIDER_OPTIONS);
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
