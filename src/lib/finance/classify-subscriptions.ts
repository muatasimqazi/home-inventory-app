import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// Server-only AI subscription classification for recurring bills — sibling
// to lib/finance/categorize.ts, same Gateway-routed primary/fallback
// reliability engineering (bounded timeout, single retry via a different
// model, no SDK-internal retry), same reason for reusing the exact same
// two "provider/model" strings rather than adding a third model to the
// app's Gateway bill. Pure text classification: a bill's name/frequency/
// amount in, a boolean back out — no category list needed, unlike
// categorize.ts, since "is this a subscription" doesn't depend on this
// household's own category taxonomy at all.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 30_000;
const CALL_MAX_RETRIES = 0;

export interface ClassifyBillInput {
  id: string;
  name: string;
  frequency: string;
  expectedAmount: number;
}

export interface SubscriptionClassificationResult {
  billId: string;
  isSubscription: boolean;
  confidence: number; // 0-1
}

const ResponseSchema = z.object({
  classifications: z.array(
    z.object({
      billId: z.string().describe("Echo back exactly one of the bill ids from the list below — do not alter it."),
      isSubscription: z
        .boolean()
        .describe(
          "True for a subscription — streaming, software, a membership, a recurring digital/media service (Netflix, Spotify, Xbox Game Pass, iCloud storage, a gym membership, etc.). False for a household bill or utility — electricity, water, internet/phone service, insurance, rent, a credit card or loan payment, property tax, etc."
        ),
      confidence: z.number().min(0).max(1).describe("How confident you are, 0-1 — lower for an ambiguous or generic name."),
    })
  ),
});

function describeBill(b: ClassifyBillInput): string {
  return `- id=${b.id}: "${b.name}" ($${b.expectedAmount.toFixed(2)} ${b.frequency})`;
}

function buildMessages(bills: ClassifyBillInput[]): ModelMessage[] {
  return [
    {
      role: "user",
      content:
        "You are classifying a household's recurring bills for a budgeting app. For each bill below, decide whether it's " +
        "a subscription (streaming, software, a membership, a recurring digital/media service) or a household bill/" +
        "utility (electricity, water, internet, insurance, rent, a loan/credit-card payment, etc.). Judge by the name " +
        "alone — you won't always recognize the exact brand, so use your best real-world judgment about what kind of " +
        "expense a name like that usually is. Give an honest confidence score, lower for a generic or ambiguous name " +
        "that could plausibly be either.\n\n" +
        `Bills:\n${bills.map(describeBill).join("\n")}\n\n` +
        "Return exactly one classification per bill, echoing back its exact id.",
    },
  ];
}

async function runClassification(model: LanguageModel, bills: ClassifyBillInput[]): Promise<SubscriptionClassificationResult[]> {
  const { output } = await generateText({
    model,
    output: Output.object({ schema: ResponseSchema }),
    messages: buildMessages(bills),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output.classifications;
}

/**
 * Classifies each bill as a subscription or not, in one batched call. The
 * primary model is tried first; on any failure this falls back to a cheap
 * OpenAI model once before giving up — same shape as
 * suggestTransactionCategories in categorize.ts.
 *
 * Returns exactly one result per input bill, in the same order — the
 * model is asked to echo bill ids back, but nothing guarantees it does so
 * faithfully or covers every one, so the raw output is reconciled against
 * the input list before returning: anything for an unknown id is dropped,
 * and any bill the model silently skipped gets a false/0-confidence
 * result instead of being missing from the response entirely.
 */
export async function classifySubscriptions(bills: ClassifyBillInput[]): Promise<SubscriptionClassificationResult[]> {
  if (bills.length === 0) return [];

  let raw: SubscriptionClassificationResult[];
  try {
    raw = await runClassification(PRIMARY_MODEL, bills);
  } catch (primaryError) {
    console.error("Primary subscription-classification model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      raw = await runClassification(FALLBACK_MODEL, bills);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (subscription classification):`, fallbackError);
      throw fallbackError;
    }
  }

  const knownIds = new Set(bills.map((b) => b.id));
  const byId = new Map<string, SubscriptionClassificationResult>();
  for (const c of raw) {
    if (!knownIds.has(c.billId)) continue;
    byId.set(c.billId, c);
  }
  return bills.map((b) => byId.get(b.id) ?? { billId: b.id, isSubscription: false, confidence: 0 });
}
