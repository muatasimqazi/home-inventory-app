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
// happen twice in one request.
//
// maxRetries is 0 — the SDK's own default (2) retries the *same* model
// with an exponential backoff sleep in between. detectItemsWithGemini
// already has its own, better retry: on any failure it moves to a
// completely different model rather than hammering the one that just
// failed. Layering the SDK's retry on top of that was actively harmful
// once too, not just redundant: on a real 429 (Gemini's free-tier daily
// quota, 20 requests/day — the actual fix for that is billing, not more
// retries), if CALL_TIMEOUT_MS fired while the SDK was mid-backoff-sleep
// for its own internal retry, the *delay itself* got aborted, surfacing
// as "AbortError: Delay was aborted" instead of a clean timeout — and
// wasting time that mattered when the fallback call still had to run
// after it in the same request. A single fast attempt per model, then
// straight to the fallback, avoids both problems. Timeout bumped up
// accordingly, since a real (non-stuck) call isn't fighting a wasted
// backoff sleep for time anymore — worst case is now 2x this, still
// comfortably under Vercel's 300s ceiling.
const CALL_TIMEOUT_MS = 30_000;
const CALL_MAX_RETRIES = 0;

// gpt-5-nano reasons by default even for a straightforward vision task —
// forcing reasoningEffort down to "minimal" was tried here to keep the
// fallback well under CALL_TIMEOUT_MS, verified against a simple synthetic
// image (plain colored shapes) with no accuracy loss. That test didn't
// cover what this app actually needs most: reading real product-label
// text. On a real label ("GREAT STUFF Gaps & Cracks Insulating Foam
// Sealant"), "minimal" didn't just get it slightly wrong — it fragmented
// one item into four garbage entries ("Oval gray sticker/oval mark",
// "Bright yellow packaging", ...) at 0.25-0.4 confidence each, while the
// model's own default reasoning read the full name correctly at 0.82
// confidence in ~9s — comfortably inside the 20s budget, not meaningfully
// slower than reasoningEffort "low" (~9s too). Not worth trading away
// accuracy on the one thing this app depends on for a speedup that isn't
// even real once graded against actual label text. Left unset — the
// model's own default — for both models; Gemini has no equivalent option.
async function runDetection(model: LanguageModel, photos: string[]): Promise<GeminiDetectedItem[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: detectionSchema }),
    messages: buildMessages(photos),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
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
