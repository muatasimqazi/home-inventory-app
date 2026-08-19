import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only receipt extraction from photos (docs/Receipt Scanning
// Addendum.md §4). Same shape as lib/vision/detect.ts — server-only
// import guard, Vercel AI Gateway routing, primary + fallback model, one
// bounded call per model — deliberately mirrored rather than abstracted
// into a shared helper: two call sites isn't enough to justify the
// indirection yet, and the two tasks' prompts/schemas are different
// enough that a shared abstraction would mostly just be plumbing.
//
// Called via /api/v1/vision/extract-receipts, never imported directly by
// a client component (lib/ai.ts's HttpVisionProvider is the only caller).
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// unit_price/line_total deliberately have no .min(0) — that was the third
// failure mode on the same real 35-item Costco receipt, after the timeout
// and truncation fixes above both held. The primary model actually
// extracted the receipt correctly, including negative amounts for
// per-item member-savings/discount lines Costco prints inline with the
// item — but the old `.min(0)` rejected those as schema violations,
// throwing AI_NoObjectGeneratedError and forcing a fallback to gpt-5-nano,
// which then failed to detect the receipt at all on a task this dense.
// The bug was in the schema being stricter than real receipts are, not in
// either model.
const lineItemSchema = z.object({
  raw_item: z.string().describe("Exactly what appears on the receipt for this line — don't clean it up."),
  standard_name: z.string().describe("The most likely full product name. If unsure, repeat raw_item."),
  brand: z.string().describe("Brand name if identifiable, empty string otherwise."),
  category_guess: z.string().describe("A short category guess for this item, e.g. 'Groceries', 'Household', 'Auto'."),
  subcategory_guess: z.string().describe("A more specific subcategory guess, e.g. 'Produce', 'Dairy'. Empty string if nothing fits."),
  quantity: z.number().min(0.01).describe("How many of this item — 3 identical units on one line is quantity 3, one line item, not three."),
  unit_price: z.number().describe("Price per unit, in dollars. Negative for a discount, coupon, or instant-savings line (e.g. Costco's per-item markdowns) — don't drop these lines or clamp them to zero."),
  line_total: z.number().describe("This line's total, in dollars. Negative for a discount, coupon, or instant-savings line — don't drop these lines or clamp them to zero."),
  confidence: z.number().min(0).max(1).describe("How confident you are in this line's extraction, 0-1."),
});

const receiptSchema = z.object({
  store: z.string().describe("The merchant/store name printed on the receipt."),
  date: z.string().describe("The transaction date in ISO format (YYYY-MM-DD)."),
  subtotal: z.number().min(0).describe("Subtotal before tax, in dollars."),
  tax: z.number().min(0).describe("Tax amount, in dollars."),
  total: z.number().min(0).describe("The final total charged, in dollars."),
  card_last_four: z.string().describe("Last 4 digits of the card printed on the receipt, if present and legible. Empty string otherwise — don't guess."),
  items: z.array(lineItemSchema),
});

const extractionSchema = z.object({
  receipts: z.array(receiptSchema).describe("One entry per distinct receipt found across the provided photos — usually one, more if a stack of receipts or a statement was photographed."),
});

export type VisionReceiptExtraction = z.infer<typeof receiptSchema>;

// Every labeled photo is included so the model can tell photos of the same
// receipt (front/back, or a long receipt split across two shots) apart
// from photos of genuinely different receipts — same "Photo N:" labeling
// convention as lib/vision/detect.ts, for the same reason (relying on part
// order alone to recover which photo is which was unreliable).
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
          // The core instruction is the proven iOS Shortcuts prompt
          // (Addendum §4), adopted verbatim rather than redesigned —
          // reused word-for-word for "raw_item must be exactly what
          // appears on the receipt... Expand common Costco abbreviations
          // when confident... If unsure, use raw_item as standard_name."
          // Wrapped with instructions for the multi-photo/multi-receipt
          // case the original single-receipt prompt didn't need to
          // handle, and the card_last_four addition (§6).
          text:
            "Extract every receipt visible across these labeled photos into structured data. Usually " +
            "there's one receipt; if the photos show a stack of several receipts or a statement with " +
            "multiple transactions, extract each as its own entry in the receipts array — use the " +
            "photo layout and any visible receipt boundaries to tell them apart, and don't merge two " +
            "distinct receipts into one entry just because they're on the same photo.\n\n" +
            "For each receipt: raw_item must be exactly what appears on the receipt for that line — " +
            "don't clean it up. standard_name should be the most likely full product name; expand " +
            "common Costco-style abbreviations when confident, and if unsure just reuse raw_item. " +
            "Give an honest confidence score per line and for the receipt overall — lower for anything " +
            "smudged, ambiguous, or partially cut off rather than guessing. Only fill in card_last_four " +
            "if the digits are actually printed and legible on the receipt — leave it empty rather than " +
            "guessing.",
        },
        ...labeledPhotos,
      ],
    },
  ];
}

// 3x lib/vision/detect.ts's 30s budget, deliberately — that number was
// tuned for "identify a handful of physical items in a photo," a
// fundamentally smaller generation task than itemizing a receipt. Output
// size here scales with the number of line items (9 fields each: raw_item,
// standard_name, brand, category_guess, subcategory_guess, quantity,
// unit_price, line_total, confidence), and a real 35-item receipt hit
// exactly this: it timed out entirely on retry after 30s, whereas the
// first attempt against it had (barely) finished in time but with zero
// items extracted — the same underlying "this receipt is a lot of output"
// problem showing up two different ways. Worst case across both attempts
// is still 2x this (180s), comfortably under Vercel's 300s function
// ceiling for this route (Node.js runtime, no maxDuration override needed).
const CALL_TIMEOUT_MS = 90_000;
const CALL_MAX_RETRIES = 0;

// Raising CALL_TIMEOUT_MS fixed the receipt timing out, but the *same*
// 35-item receipt then failed a second, different way: AI_NoObjectGenerated
// Error — the response's own visible text trailed off mid-item, unclosed
// brackets, not valid JSON. That's output-token truncation, not a timing
// problem: with no maxOutputTokens set, generateText fell back to
// whichever default the provider applies, and 9 fields × dozens of items
// (each ~70-100 tokens of JSON) plus receipt-level fields comfortably
// exceeds a modest default. Set explicitly and generously — 16k tokens
// covers a genuinely large receipt (80+ items) or a multi-receipt batch
// scan (the schema's `receipts` is an array) with real margin, and an AI
// Gateway call is billed by tokens actually generated, not this ceiling,
// so there's no cost downside to leaving headroom. Applies to both models
// — gpt-5-nano's own default reasoning behavior (see lib/vision/detect.ts's
// comment on it) can eat into a *low* ceiling before any real JSON output
// happens at all, so the fallback needs the same generous budget as the
// primary, not less.
const MAX_OUTPUT_TOKENS = 16_000;

async function runExtraction(model: LanguageModel, photos: string[]): Promise<VisionReceiptExtraction[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: extractionSchema }),
    messages: buildMessages(photos),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  return output.receipts;
}

/**
 * Extracts every receipt across one or more photos in a single call. Same
 * primary-then-fallback structure as detectItems() in lib/vision/detect.ts
 * — a provider-wide outage on one side doesn't block extraction entirely.
 */
export async function extractReceipts(photos: string[]): Promise<VisionReceiptExtraction[]> {
  try {
    return await runExtraction(PRIMARY_MODEL, photos);
  } catch (primaryError) {
    console.error("Primary receipt extraction model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runExtraction(FALLBACK_MODEL, photos);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
