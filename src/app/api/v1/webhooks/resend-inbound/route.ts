import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { extractReceiptFromEmail } from "@/lib/vision/extract-email-receipt";
import { resolveCategory, resolveAccountByCardLastFour, draftNeedsReview } from "@/lib/receipt-resolution";
import {
  receiptScanBatchToInsertRow,
  scannedTransactionDraftToInsertRow,
  scannedReceiptLineItemToInsertRow,
  rowToMember,
  rowToAccount,
  rowToFinanceCategory,
  rowToCategoryRule,
} from "@/lib/supabase/mappers";
import { newId } from "@/lib/id";
import type { ReceiptScanBatch, ScannedTransactionDraft, ScannedReceiptLineItem } from "@/lib/types";

export const runtime = "nodejs";

// The subdomain configured as this app's inbound-email receiving domain
// in Resend's dashboard — every household's forwarding address is
// `${receiptsToken}@${RECEIPTS_DOMAIN}`. Not an env var: changing it means
// re-verifying a new domain in Resend and updating every household's
// already-shared address, a deliberate action, not a deploy-time config
// swap.
const RECEIPTS_DOMAIN = "receipts.shohaz.muatasim.com";

function toCents(dollars: number | null | undefined): number | null {
  if (dollars === null || dollars === undefined || Number.isNaN(dollars)) return null;
  return Math.round(dollars * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Very small HTML-to-text fallback for when Resend's `text` field is empty but `html` isn't — most real receipt emails have a text part, but not all. No new dependency for what's meant to just get the model something readable, not a real renderer. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Inbound email-receipt webhook (Bugs & Features backlog, item 8) — a
 * household forwards (or CCs) a purchase confirmation with no physical
 * receipt to token@receipts.<domain>; Resend receives it and POSTs an
 * `email.received` event here. Verifies the request is genuinely from
 * Resend (Svix signature, not a session — there's no signed-in user for
 * a webhook), looks up which household the address belongs to, extracts
 * a receipt from the email's own text, and lands it in the same pending-
 * draft pipeline photo scanning uses (receipt_scan_batches /
 * scanned_transaction_drafts / scanned_receipt_line_items) — reviewed and
 * confirmed later from /finance/pending-receipts, not auto-created as a
 * real transaction. Runs on the service-role client throughout: no
 * signed-in user exists in this request to act as.
 */
export async function POST(request: Request) {
  const resendApiKey = process.env.RESEND_API_KEY;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!resendApiKey || !webhookSecret) {
    console.error("resend-inbound webhook called but RESEND_API_KEY/RESEND_WEBHOOK_SECRET aren't configured.");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const resend = new Resend(resendApiKey);

  // MUST verify against the raw body — re-parsing and re-stringifying
  // JSON can change key order/whitespace, breaking the signature (same
  // requirement as any Svix-signed webhook, e.g. Vercel's own drains).
  const rawBody = await request.text();
  let event;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret,
    });
  } catch (error) {
    console.error("resend-inbound: signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  if (event.type !== "email.received") {
    // This route is only meant to be subscribed to email.received in
    // Resend's dashboard, but a stray event type from a misconfigured
    // webhook shouldn't error/retry-loop — just acknowledge and move on.
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  const { email_id, to, from, subject } = event.data;
  const receiptsAddress = to.find((addr) => addr.toLowerCase().endsWith(`@${RECEIPTS_DOMAIN}`));
  if (!receiptsAddress) {
    console.error("resend-inbound: no address on this domain in `to`:", to);
    return NextResponse.json({ ok: true, routed: false });
  }
  const token = receiptsAddress.split("@")[0].toLowerCase();

  const admin = getSupabaseAdminClient();

  const { data: householdRow, error: householdError } = await admin.from("households").select("*").eq("receipts_token", token).maybeSingle();
  if (householdError || !householdRow) {
    console.error(`resend-inbound: no household matches token from ${receiptsAddress}:`, householdError);
    // Not retryable — there's genuinely nothing to route this to. 200 so
    // Resend doesn't keep retrying an address that will never resolve.
    return NextResponse.json({ ok: true, routed: false });
  }
  const householdId: string = householdRow.id;

  const [{ data: memberRows }, { data: accountRows }, { data: categoryRows }, { data: ruleRows }] = await Promise.all([
    admin.from("members").select("*").eq("household_id", householdId),
    admin.from("accounts").select("*").eq("household_id", householdId),
    admin.from("categories").select("*").eq("household_id", householdId),
    admin.from("category_rules").select("*").eq("household_id", householdId),
  ]);
  const members = (memberRows ?? []).map(rowToMember);
  const accounts = (accountRows ?? []).map(rowToAccount);
  const categories = (categoryRows ?? []).map(rowToFinanceCategory);
  const categoryRules = (ruleRows ?? []).map(rowToCategoryRule);

  // confirm_scanned_transaction_draft() (called later, from a real
  // signed-in user reviewing this draft) needs created_by_user_id on the
  // batch to be a real household member — there's no signed-in user here
  // to attribute it to, so it goes to the household's owner. Every
  // household has at least one by construction (create_household()).
  const owner = members.find((m) => m.role === "owner");
  if (!owner) {
    console.error(`resend-inbound: household ${householdId} has no owner member — can't attribute this batch.`);
    return NextResponse.json({ ok: true, routed: false });
  }

  let subjectText = subject ?? "";
  let bodyText = "";
  try {
    const { data: fullEmail } = await resend.emails.receiving.get(email_id);
    subjectText = fullEmail?.subject ?? subjectText;
    bodyText = fullEmail?.text?.trim() || (fullEmail?.html ? stripHtml(fullEmail.html) : "");
  } catch (error) {
    console.error(`resend-inbound: couldn't fetch full email content for ${email_id}:`, error);
    // Fall through with just the subject — still worth creating a
    // needs-review draft rather than dropping the email entirely.
  }

  let extracted = null;
  if (bodyText) {
    try {
      extracted = await extractReceiptFromEmail(subjectText, bodyText);
    } catch (error) {
      console.error(`resend-inbound: extraction failed for email ${email_id} from ${from}:`, error);
      // Same reasoning as the fetch failure above — still create a draft
      // so the household sees *something* arrived, just unparsed.
    }
  }

  const category = extracted ? resolveCategory(extracted.store, "merchant", categoryRules, categories) : { categoryId: null, source: null, confidence: 0 };
  const account = extracted ? resolveAccountByCardLastFour(extracted.card_last_four, accounts) : { accountId: null, matchState: "none" as const };
  const itemCount = extracted?.items.length ?? 0;
  const receiptConfidence = extracted && itemCount > 0 ? avg(extracted.items.map((it) => it.confidence)) : 0.5;
  const { needsReview, reviewReason } = extracted
    ? draftNeedsReview(receiptConfidence, category, account, itemCount)
    : { needsReview: true, reviewReason: `Couldn't automatically read this email (from ${from}, subject "${subjectText}") — check the details manually.` };

  const batchId = newId();
  const batch: ReceiptScanBatch = {
    id: batchId,
    householdId,
    sourceImagePaths: [], // no photo — this arrived by email, not a scan
    status: "ready_for_review",
    detectedCount: extracted ? 1 : 0,
    confirmedCount: 0,
    createdByUserId: owner.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    source: "email",
  };

  const draftId = newId();
  const draft: ScannedTransactionDraft = {
    id: draftId,
    householdId,
    batchId,
    store: extracted?.store || (subjectText || null),
    suggestedDate: extracted?.date || null,
    subtotalCents: extracted ? toCents(extracted.subtotal) : null,
    taxCents: extracted ? toCents(extracted.tax) : null,
    suggestedAmountCents: extracted ? toCents(extracted.total) : null,
    suggestedCategoryId: category.categoryId,
    categorySource: category.source,
    confidence: round2(receiptConfidence),
    needsReview,
    reviewReason: reviewReason ?? null,
    boundingBox: null,
    photoIndex: 0,
    status: "pending",
    resultingTransactionId: null,
    accountId: account.accountId,
  };

  const lineItems: ScannedReceiptLineItem[] = (extracted?.items ?? []).map((it) => {
    const itemCategory = resolveCategory(it.category_guess, "description", categoryRules, categories);
    return {
      id: newId(),
      householdId,
      draftId,
      transactionId: null,
      rawItem: it.raw_item,
      standardName: it.standard_name || null,
      brand: it.brand || null,
      categoryGuessId: itemCategory.categoryId,
      subcategoryGuessId: null,
      subcategoryGuessText: it.subcategory_guess || null,
      quantity: it.quantity,
      unitPriceCents: toCents(it.unit_price),
      lineTotalCents: toCents(it.line_total),
      confidence: round2(it.confidence),
      refundTransactionId: null,
      refundedAmountCents: null,
    };
  });

  const { error: batchError } = await admin.from("receipt_scan_batches").insert(receiptScanBatchToInsertRow(batch));
  if (batchError) {
    console.error("resend-inbound: couldn't insert batch:", batchError);
    // 500, not 200 — this is a real failure on our side, and it's exactly
    // the case Resend's own retry-on-failure exists for.
    return NextResponse.json({ error: "Couldn't record this receipt." }, { status: 500 });
  }
  const { error: draftError } = await admin.from("scanned_transaction_drafts").insert(scannedTransactionDraftToInsertRow(draft));
  if (draftError) {
    console.error("resend-inbound: couldn't insert draft:", draftError);
    return NextResponse.json({ error: "Couldn't record this receipt." }, { status: 500 });
  }
  if (lineItems.length > 0) {
    const { error: lineItemsError } = await admin.from("scanned_receipt_line_items").insert(lineItems.map(scannedReceiptLineItemToInsertRow));
    if (lineItemsError) console.error("resend-inbound: couldn't insert line items (draft still created):", lineItemsError);
  }

  return NextResponse.json({ ok: true, routed: true, draftId, parsed: extracted !== null });
}
