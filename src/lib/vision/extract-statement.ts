import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only statement extraction from an uploaded PDF. Same shape as
// lib/vision/extract-receipts.ts — server-only import guard, Vercel AI
// Gateway routing, primary + fallback model, one bounded call per model —
// deliberately mirrored rather than sharing code with it: the input media
// type (PDF vs. photo), prompt, and schema are different enough that a
// shared abstraction would mostly just be plumbing, same reasoning that
// file already gives for not sharing with lib/vision/detect.ts.
//
// Called via /api/v1/vision/extract-statement, never imported directly by
// a client component (lib/ai.ts's HttpVisionProvider is the only caller).
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const transactionSchema = z.object({
  date: z.string().describe("The transaction's posted or transaction date, in ISO format (YYYY-MM-DD)."),
  merchant: z.string().describe("The merchant/description exactly as printed on the statement — don't clean it up or expand abbreviations."),
  // No .min()/.max() — a statement legitimately mixes charges (negative)
  // and payments/credits/refunds (positive), same signed convention as
  // Transaction.amount elsewhere in this app.
  amount: z.number().describe("Signed dollar amount: negative for a charge/purchase/debit, positive for a payment, credit, or refund."),
});

const extractionSchema = z.object({
  transactions: z.array(transactionSchema).describe("Every transaction line found across every page of the statement, in the order printed."),
});

export type VisionStatementTransaction = z.infer<typeof transactionSchema>;

// A real multi-page statement can run to dozens or low hundreds of
// transaction lines, each ~30-50 tokens of JSON once you include the
// merchant string — comfortably larger than a single receipt's output.
// Budgeted generously for the same reason extract-receipts.ts sets
// MAX_OUTPUT_TOKENS explicitly: no ceiling means whatever the provider's
// own default is, which silently truncates a long enough document.
const MAX_OUTPUT_TOKENS = 32_000;
const CALL_TIMEOUT_MS = 90_000;
const CALL_MAX_RETRIES = 0;

function buildMessages(fileDataUrl: string): ModelMessage[] {
  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Extract every transaction line from this bank or credit card statement — every page, not just the first. " +
            "For each: date is the transaction/posted date in ISO format; merchant is exactly what's printed (don't clean " +
            "it up, expand abbreviations, or guess a nicer name); amount is signed — negative for a charge/purchase/debit, " +
            "positive for a payment, credit, or refund, matching how the statement itself distinguishes them (a debit " +
            "column, a minus sign, parentheses, etc. — whatever convention this specific statement uses). Skip non" +
            "-transaction lines entirely: running balances, subtotals, interest-rate disclosures, minimum-payment " +
            "notices, and the like aren't transactions.",
        },
        { type: "file", mediaType: "application/pdf", data: fileDataUrl },
      ],
    },
  ];
}

async function runExtraction(model: LanguageModel, fileDataUrl: string): Promise<VisionStatementTransaction[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: extractionSchema }),
    messages: buildMessages(fileDataUrl),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });
  return output.transactions;
}

/**
 * Extracts every transaction line from one statement PDF. Same
 * primary-then-fallback structure as extractReceipts()/detectItems() — a
 * provider-wide outage on one side doesn't block the whole import.
 */
export async function extractStatement(fileDataUrl: string): Promise<VisionStatementTransaction[]> {
  try {
    return await runExtraction(PRIMARY_MODEL, fileDataUrl);
  } catch (primaryError) {
    console.error("Primary statement extraction model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runExtraction(FALLBACK_MODEL, fileDataUrl);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
