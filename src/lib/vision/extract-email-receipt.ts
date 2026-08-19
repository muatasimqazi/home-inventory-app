import "server-only";
import { generateText, Output, type LanguageModel } from "ai";
import { z } from "zod";
import { receiptSchema, type VisionReceiptExtraction } from "./extract-receipts";

// Email-receipt extraction (Bugs & Features backlog, item 8) — a purchase
// with no physical receipt, forwarded to the household's receipts inbox
// instead. Same primary/fallback/AI-Gateway reliability pattern as every
// other lib/vision/* module, reusing extract-receipts.ts's own
// receiptSchema for the *output* shape (so downstream draft-creation code
// doesn't need to know whether a receipt came from a photo or an email) —
// only the input (plain text, not a photo/PDF) and prompt differ enough
// to warrant a separate call site rather than overloading buildMessages()
// there with a third media type.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// Plain text, no vision/PDF decoding — much cheaper and faster than the
// other extraction tasks, and a single email's line-item count is small
// (a restaurant order, an online cart) compared to a Costco run or a
// multi-page statement, hence the tighter budgets below.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;
const MAX_OUTPUT_TOKENS = 8_000;

const emailExtractionSchema = z.object({
  isReceipt: z
    .boolean()
    .describe(
      "True only if this email is a purchase confirmation, receipt, or invoice with a real charge. False for a shipping/delivery update with no price, a newsletter, a password reset, or anything else that isn't itself proof of a purchase."
    ),
  receipt: receiptSchema.nullable().describe("Present only when isReceipt is true — null otherwise, don't invent placeholder values."),
});

function buildPrompt(subject: string, bodyText: string): string {
  return (
    "This email was forwarded to a household's receipts inbox. First decide whether it's actually a purchase " +
    "receipt/confirmation/invoice with a real dollar amount charged — not a shipping/tracking update with no " +
    "price, a newsletter, or anything unrelated. If it is, extract the same fields real photographed-receipt " +
    "scanning does: store (the merchant name), date (ISO format), subtotal, tax, total, card_last_four (only if " +
    "actually printed/legible in the email, empty string otherwise — never guess), and items (line items if the " +
    "email lists individual products/services; an empty array is fine when only a total is shown, e.g. a simple " +
    "payment confirmation). raw_item should be exactly as written in the email, don't clean it up or expand " +
    "abbreviations." +
    `\n\nSubject: ${subject}\n\nBody:\n${bodyText}`
  );
}

async function runExtraction(model: LanguageModel, subject: string, bodyText: string) {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: emailExtractionSchema }),
    prompt: buildPrompt(subject, bodyText),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  return output;
}

/**
 * Extracts a receipt from a forwarded email's subject + body text, or
 * returns null when the email genuinely isn't a purchase receipt (a
 * shipping notification, a newsletter, ...) — the caller (the inbound
 * webhook route) still creates a needs-review draft either way so nothing
 * silently vanishes, just without confident structured fields when this
 * returns null.
 */
export async function extractReceiptFromEmail(subject: string, bodyText: string): Promise<VisionReceiptExtraction | null> {
  try {
    const result = await runExtraction(PRIMARY_MODEL, subject, bodyText);
    return result.isReceipt ? result.receipt : null;
  } catch (primaryError) {
    console.error("Primary email-receipt extraction model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      const result = await runExtraction(FALLBACK_MODEL, subject, bodyText);
      return result.isReceipt ? result.receipt : null;
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
