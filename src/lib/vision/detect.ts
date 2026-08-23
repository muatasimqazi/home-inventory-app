import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { CATEGORIES } from "@/lib/types";
import { matchReferenceLocation, type ReferenceInventoryItem } from "@/lib/reference/starter-inventory";
// Direct (static, top-level) JSON import rather than starter-inventory.ts's
// own loadReferenceItems() dynamic import — that dynamic import exists
// specifically to keep the ~220KB item list out of a *client* bundle that
// hasn't asked for it yet (see that file's header comment). This module is
// "server-only" already, so there's no bundle to protect: a plain static
// import is simpler, has no first-call latency/await, and Next.js still
// tree-shakes/bundles it once at build time same as any other server module.
import referenceItemsJson from "@/lib/reference/starter-inventory-items.json";

const referenceItems = referenceItemsJson as ReferenceInventoryItem[];

// Server-only vision item detection from photos. The `server-only` import
// makes an accidental client-component import of this module a build error
// — not that there's a secret key to protect anymore (see below), but the
// Gateway credentials/OIDC this now runs on still have no business in the
// browser bundle.
//
// This is the active implementation (see lib/ai.ts's `visionProvider`),
// called via /api/v1/vision/detect rather than imported directly by any
// client component.
//
// Both models below are plain "provider/model" strings, routed through
// Vercel AI Gateway automatically (no @ai-sdk/gateway package needed) using
// whatever Gateway credentials/OIDC the project already has — previously
// only true of the fallback; the primary used to call Google directly via
// GEMINI_API_KEY. Consolidated onto Gateway for both: one bill instead of
// two separate ones (Google Cloud billing + Gateway credits), and the
// primary's free-tier daily quota (20 requests/day, a real 429 seen live —
// see docs/bugs or git history) was tied to that personal key/project
// specifically, not to the Gateway's own backing credentials, so routing
// through Gateway sidesteps it rather than just raising the same ceiling.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";

// Only used when the primary fails — picked as the cheapest current
// vision-capable OpenAI model, since it only ever runs as a fallback, not
// the primary detector.
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
    "A box around this item within its photo, in normalized 0-1 coordinates — loosely covering the " +
      "whole cluster of them together when quantity is more than 1, not just one of them. Null if you " +
      "can't confidently localize it — e.g. it's spread across the whole frame, or it's genuinely " +
      "hard to tell where it starts/ends. Don't guess a box you're not fairly sure of."
  );

const detectionSchema = z.object({
  items: z.array(
    z.object({
      suggestedName: z.string().describe("A concise, human-readable name for the item, e.g. 'Cordless Drill'."),
      category: z.enum([...CATEGORIES] as [string, ...string[]]),
      description: z
        .string()
        .describe(
          "A brief, factual 1-2 sentence description — material, color, size, and any other " +
            "distinguishing physical details actually visible. A standalone record of what this item " +
            "is, not just a repeat of the name — useful for insurance or warranty purposes later."
        ),
      estimatedValue: z
        .number()
        .min(0)
        .nullable()
        .describe(
          "A rough estimated replacement value in USD — your best general-knowledge guess at what " +
            "buying this item (or a directly equivalent one) new would cost today, rounded to a " +
            "sensible amount (45, not 44.87). This is for a household inventory's insurance/net-worth " +
            "records, a reasonable ballpark is fine, not an appraisal. Null only if you genuinely have " +
            "no basis to guess at all — can't tell what kind of item it even is, let alone its quality " +
            "tier or brand — not just because you're not fully certain."
        ),
      suggestedTags: z.array(z.string()).describe("0-3 short lowercase tags, e.g. 'power-tools'."),
      confidence: z.number().min(0).max(1).describe("How confident you are in the identification, 0-1."),
      photoEmoji: z.string().describe("A single emoji that best represents this item."),
      photoIndex: z.number().int().min(0).describe("0-based index of the labeled photo (Photo 0, Photo 1, ...) this item appears in."),
      quantity: z
        .number()
        .int()
        .min(1)
        .max(9999)
        .describe(
          "How many identical (or near-identical — same product, same use) copies of this item are " +
            "visible together. 3 identical pens is one entry with quantity 3, not three separate " +
            "entries — only give an item its own separate entry when it's actually a different item " +
            "(different product, different color/size that matters, etc.). 1 if there's just one."
        ),
      boundingBox: boundingBoxSchema,
    })
  ),
});

export type VisionDetectedItem = z.infer<typeof detectionSchema>["items"][number];

// Reference-catalog prompt steer (see this file's header-level comment
// block below runDetection for the full design writeup). Capped at 100
// items: Kitchen, the largest of the 22 reference locations, has 380 —
// sending all of them on every single capture call would add real tokens
// and real latency to a flow that already spends its CALL_TIMEOUT_MS budget
// carefully (see that constant's comment below), for a "soft steer" whose
// job is done just as well by a representative sample as by the full list.
// 100 sits in the middle of this workstream's recommended 80-120 range.
const REFERENCE_HINT_ITEM_CAP = 100;

/**
 * Deterministically samples `count` items evenly spread across `items`
 * (assumed alphabetically ordered per-location, matching the source data's
 * own layout — see starter-inventory.ts's header comment) rather than just
 * truncating to the first `count`. A straight truncation of an alphabetical
 * list would only ever surface names starting with the first few letters
 * (e.g. "Acetate", "Adhesive", ...) — an evenly-strided sample instead
 * covers the location's full range, which matters more for a steer meant to
 * catch whatever the household actually points a camera at.
 */
function sampleEvenly<T>(items: T[], count: number): T[] {
  if (items.length <= count) return items;
  const step = items.length / count;
  const picked: T[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(items[Math.floor(i * step)]);
  }
  return picked;
}

/**
 * Builds the optional reference-catalog prompt addition for a given
 * household Location name, or null when there's nothing useful to add —
 * no name given, no reasonable match among the 22 bundled reference
 * locations (matchReferenceLocation), or (belt-and-suspenders) that
 * location somehow has zero reference items. Every one of those is a
 * silent no-op, never an error: this is a soft steer, and its total absence
 * must reproduce exactly today's prompt/behavior.
 */
function buildReferenceHint(locationName: string | null | undefined): string | null {
  if (!locationName) return null;
  try {
    const matched = matchReferenceLocation(locationName);
    if (!matched) return null;
    const itemsForLocation = referenceItems.filter((it) => it.location === matched);
    if (itemsForLocation.length === 0) return null;
    const sampled = sampleEvenly(itemsForLocation, REFERENCE_HINT_ITEM_CAP);
    const list = sampled.map((it) => `${it.name} (${it.category})`).join(", ");
    return (
      `Here are common item names typically found in a ${matched}: ${list}. If what you see closely ` +
      "and confidently matches one of these, use that exact name (and its category, provided " +
      "alongside) — otherwise use your own best judgment as usual, exactly like today."
    );
  } catch (error) {
    // Never let a reference-catalog problem take down detection itself —
    // fall back to no hint, exactly as if locationName had been omitted.
    console.error("Failed to build reference-catalog hint, continuing without it:", error);
    return null;
  }
}

// Each photo gets an explicit "Photo N:" label immediately before its file
// part — relying on the model to infer index purely from part order was
// unreliable enough not to trust for something the crop step depends on
// (photoIndex needs to be right, or an item's cover comes from the wrong
// photo entirely).
function buildMessages(photos: string[], referenceHint: string | null): ModelMessage[] {
  const labeledPhotos = photos.flatMap((photo, i) => [
    { type: "text" as const, text: `Photo ${i}:` },
    { type: "file" as const, mediaType: "image" as const, data: photo },
  ]);

  const baseText =
    "You are cataloging items for a home inventory app. Identify every distinct KIND of " +
    "physical item visible across these labeled photos — when you see multiple identical (or " +
    "near-identical, e.g. same product) copies of the same item, that's ONE entry with an " +
    "accurate quantity, not one entry per copy. Someone's drawer of 5 identical pens is a " +
    "single 'Pen' entry with quantity 5, not 5 separate 'Pen' entries. For each entry, pick " +
    "the category from the allowed list that fits best, suggest a couple of short lowercase " +
    "tags if relevant, and give an honest confidence score — use a lower score for anything " +
    "ambiguous, partially obscured, or generic-looking rather than guessing.\n\n" +
    "Also give each entry a brief factual description and a rough estimated replacement value " +
    "in USD — see the description and estimatedValue field descriptions for exactly what makes " +
    "a good one of each.\n\n" +
    "Also report, per entry, which labeled photo it's in (photoIndex) and a bounding box " +
    "around it within that photo — one photo can contain several different items (e.g. a " +
    "shelf holding a hammer, a drill, and a box of screws), and each needs its own box so its " +
    "cover photo can be cropped to just it instead of the whole shot. See the quantity and " +
    "boundingBox field descriptions for exactly how to handle multiples of the same item, and " +
    "when to leave boundingBox null instead of guessing.";

  return [
    {
      role: "user",
      content: [
        { type: "text", text: referenceHint ? `${baseText}\n\n${referenceHint}` : baseText },
        ...labeledPhotos,
      ],
    },
  ];
}

// detectItems can make up to two of these calls back to back (primary,
// then the fallback model) — each needs its own bound or a stalled
// provider (not erroring, just never responding) can run unbounded and
// blow past Vercel's function timeout entirely, which is exactly what
// "Task timed out after 300 seconds" was: no `timeout` was set, so a
// slow/stuck call just sat there, and worst case that could happen twice
// in one request.
//
// maxRetries is 0 — the SDK's own default (2) retries the *same* model
// with an exponential backoff sleep in between. detectItems already has
// its own, better retry: on any failure it moves to a completely
// different model rather than hammering the one that just failed.
// Layering the SDK's retry on top of that was actively harmful once too,
// not just redundant: on a real 429 (the primary's old free-tier daily
// quota — see PRIMARY_MODEL's comment), if CALL_TIMEOUT_MS fired while the
// SDK was mid-backoff-sleep for its own internal retry, the *delay
// itself* got aborted, surfacing as "AbortError: Delay was aborted"
// instead of a clean timeout — and wasting time that mattered when the
// fallback call still had to run after it in the same request. A single
// fast attempt per model, then straight to the fallback, avoids both
// problems. Timeout bumped up accordingly, since a real (non-stuck) call
// isn't fighting a wasted backoff sleep for time anymore — worst case is
// now 2x this, still comfortably under Vercel's 300s ceiling.
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
// confidence in ~9s — comfortably inside the timeout budget, not
// meaningfully slower than reasoningEffort "low" (~9s too). Not worth
// trading away accuracy on the one thing this app depends on for a
// speedup that isn't even real once graded against actual label text.
// Left unset — the model's own default — for both models.
async function runDetection(model: LanguageModel, photos: string[], referenceHint: string | null): Promise<VisionDetectedItem[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: detectionSchema }),
    messages: buildMessages(photos, referenceHint),
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
 * `locationName` is an optional hint — the household's own name for the
 * capture's current destination Location — used to softly steer the model
 * toward matching names/categories already in the bundled reference catalog
 * (lib/reference/starter-inventory.ts) for that location, per "The data is
 * the source of truth for the home... AI should use this if possible before
 * suggesting new ones of its own." This is prompt-level guidance only, not
 * a post-hoc override: the schema, the model's own judgment, and every
 * existing field stay exactly as before. Omitted, unmatched, or otherwise
 * unusable (see buildReferenceHint) all degrade silently to the unscoped
 * prompt — no locationName reproduces prior behavior exactly.
 *
 * The primary model is tried first; if it fails for any reason, this falls
 * back to a cheap OpenAI model once before giving up, so a provider-wide
 * outage on one side doesn't block detection entirely. Bounding-box
 * localization from the fallback model is expected to be less reliable than
 * the primary's — that's fine, a missing/invalid box just falls back to the
 * full photo downstream (see cropToItem in lib/crop-image.ts), never a hard
 * error.
 */
export async function detectItems(photos: string[], locationName?: string | null): Promise<VisionDetectedItem[]> {
  const referenceHint = buildReferenceHint(locationName);
  try {
    return await runDetection(PRIMARY_MODEL, photos, referenceHint);
  } catch (primaryError) {
    console.error("Primary vision model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runDetection(FALLBACK_MODEL, photos, referenceHint);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      // Surface the fallback's error — it's the one that actually ended the
      // attempt. The API route's status-code handling treats a 503/429 from
      // either provider as the same "high demand" case, so which one
      // surfaces rarely matters for the message the user sees; the primary
      // model's error is still logged above for debugging.
      throw fallbackError;
    }
  }
}

// ---------------------------------------------------------------------------
// Appliance label OCR (Household Ledger PRD §27, Implementation Plan
// Workstream 7) — a second, independent detection task on the same
// PRIMARY_MODEL/FALLBACK_MODEL pair and the same reliability engineering
// (Gateway routing, bounded timeout, single-retry-via-fallback) as
// detectItems above. Deliberately a separate schema/prompt/function rather
// than folding appliance fields into detectionSchema: detectItems reasons
// about a whole scene ("what items are in this photo"), this reasons about
// one manufacturer nameplate ("read this label") — different task, and
// keeping it separate means this addition can't change detectItems' schema,
// prompt, or behavior for the general item-capture flow.
// ---------------------------------------------------------------------------

const applianceLabelSchema = z.object({
  suggestedName: z.string().describe("A concise, human-readable name for the appliance, e.g. 'Samsung Refrigerator' or 'LG Front-Load Washer'."),
  photoEmoji: z.string().describe("A single emoji that best represents this appliance."),
  manufacturer: z.string().describe("The brand/manufacturer printed on the label. Empty string if not legible."),
  modelNumber: z.string().describe("The model number printed on the label (often labeled 'MODEL', 'MOD', or 'MODEL NO'). Empty string if not legible."),
  serialNumber: z.string().describe("The serial number printed on the label (often labeled 'SERIAL', 'SER', or 'S/N'). Empty string if not legible."),
  manufactureDate: z
    .string()
    .describe(
      "The approximate manufacture date if printed or decodable from the label (a full date, a month/year, or just a year is fine — whatever precision the label actually supports). Empty string if there's nothing to go on. Never fabricate a date from a serial number format you're not confident about."
    ),
  confidence: z.number().min(0).max(1).describe("How confident you are in the reading overall — lower if the label is blurry, glare-obscured, or partially out of frame."),
});

export type ApplianceLabelDetection = z.infer<typeof applianceLabelSchema>;

function buildApplianceLabelMessages(photos: string[]): ModelMessage[] {
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
            "You are reading the manufacturer's nameplate/rating label on a home appliance (e.g. a refrigerator, " +
            "washer, dryer, dishwasher, water heater, HVAC unit, microwave). These labels are usually a small " +
            "sticker or metal plate on the appliance's interior edge, back, or side, printed with the brand, a " +
            "model number, and a serial number, sometimes with a manufacture date or a date code. Read exactly " +
            "what's printed — do not guess a plausible-looking model or serial number if the label is too blurry " +
            "or obscured to actually read it; leave that field empty instead. Give an honest overall confidence " +
            "score, lower for anything blurry, glare-obscured, or partially out of frame.",
        },
        ...labeledPhotos,
      ],
    },
  ];
}

async function runApplianceLabelDetection(model: LanguageModel, photos: string[]): Promise<ApplianceLabelDetection> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: applianceLabelSchema }),
    messages: buildApplianceLabelMessages(photos),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output;
}

/**
 * Reads a manufacturer's nameplate/rating label from one or more photos of
 * it, extracting manufacturer, model number, serial number, and an
 * approximate manufacture date when the label supports one. Same
 * primary-then-fallback-model shape as detectItems.
 */
export async function detectApplianceLabel(photos: string[]): Promise<ApplianceLabelDetection> {
  try {
    return await runApplianceLabelDetection(PRIMARY_MODEL, photos);
  } catch (primaryError) {
    console.error("Primary vision model failed (appliance label), falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runApplianceLabelDetection(FALLBACK_MODEL, photos);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (appliance label):`, fallbackError);
      throw fallbackError;
    }
  }
}

// ---------------------------------------------------------------------------
// Appliance document links — text-only (no photo input, unlike every other
// function in this file), but kept here rather than a separate module:
// same PRIMARY_MODEL/FALLBACK_MODEL pair, same reliability engineering
// (Gateway routing, bounded timeout, single-retry-via-fallback).
//
// The model has no live web-browsing/search tool here — this is a single
// generateText call against its own training data, nothing more. Any URL
// it gives back can be wrong, outdated, or (despite the prompt explicitly
// forbidding it) fabricated. That's why this only ever produces *links*
// the user opens and judges for themselves (item_document_links,
// 0035_item_document_links.sql) — never a downloaded/rehosted file, and
// never presented as verified.
// ---------------------------------------------------------------------------

const documentLinkSchema = z.object({
  manualUrl: z
    .string()
    .nullable()
    .describe(
      "Your best-guess direct URL to this exact product's official user manual or documentation page, " +
        "from what you know of this manufacturer's website. Null if you don't have a specific, plausible " +
        "URL in mind for this model — never invent a URL that merely looks right."
    ),
  manualLabel: z.string().describe("Short label for the manual link, e.g. 'Samsung Support — RF28 Manual'. Empty string if manualUrl is null."),
  warrantyUrl: z
    .string()
    .nullable()
    .describe(
      "Your best-guess direct URL to this manufacturer's warranty registration or warranty-terms page for " +
        "this product line. Null if you don't have a specific, plausible URL in mind — never invent one."
    ),
  warrantyLabel: z.string().describe("Short label for the warranty link, e.g. 'Samsung Warranty Info'. Empty string if warrantyUrl is null."),
});

export type DocumentLinkSuggestion = z.infer<typeof documentLinkSchema>;

function buildDocumentLinkMessages(manufacturer: string, modelNumber: string): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            `A household is cataloging a "${manufacturer} ${modelNumber}" appliance and wants to find its ` +
            "official manual and warranty information online. Based on your own knowledge of this " +
            "manufacturer and product, suggest the most likely URL for its manual/documentation page and " +
            "for its warranty page. You have no ability to browse the web or verify these right now — only " +
            "suggest a URL when you have a specific, genuine reason to believe it's roughly right (e.g. you " +
            "know this manufacturer's support site is structured a particular way); leave a field null " +
            "rather than guessing something plausible-looking. Being right less often but never fabricating " +
            "is much more useful here than always returning a confident-looking URL.",
        },
      ],
    },
  ];
}

async function runDocumentLinkSuggestion(model: LanguageModel, manufacturer: string, modelNumber: string): Promise<DocumentLinkSuggestion> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: documentLinkSchema }),
    messages: buildDocumentLinkMessages(manufacturer, modelNumber),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output;
}

/**
 * Suggests likely manual/warranty document links for an Appliance item
 * from its manufacturer + model number alone (both required — a vague
 * guess without a specific model to anchor it isn't worth the call). Same
 * primary-then-fallback-model shape as detectItems/detectApplianceLabel.
 */
export async function suggestApplianceDocumentLinks(manufacturer: string, modelNumber: string): Promise<DocumentLinkSuggestion> {
  try {
    return await runDocumentLinkSuggestion(PRIMARY_MODEL, manufacturer, modelNumber);
  } catch (primaryError) {
    console.error("Primary vision model failed (document links), falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runDocumentLinkSuggestion(FALLBACK_MODEL, manufacturer, modelNumber);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (document links):`, fallbackError);
      throw fallbackError;
    }
  }
}
