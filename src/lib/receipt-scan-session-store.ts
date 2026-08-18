"use client";

import { create } from "zustand";
import { getSupabaseBrowserClient } from "./supabase/client";
import { visionProvider, VisionDetectionError, type ReceiptExtraction } from "./ai";
import { resolveCategory, resolveAccountByCardLastFour, draftNeedsReview } from "./receipt-resolution";
import { newId } from "./id";
import {
  receiptScanBatchToInsertRow,
  scannedTransactionDraftToInsertRow,
  scannedReceiptLineItemToInsertRow,
  rowToReceiptScanBatch,
  rowToScannedTransactionDraft,
  rowToScannedReceiptLineItem,
} from "./supabase/mappers";
import type { Account, CategoryRule, FinanceCategory, ReceiptScanBatch, ScannedTransactionDraft, ScannedReceiptLineItem } from "./types";

export interface DraftRow extends ScannedTransactionDraft {
  lineItems: ScannedReceiptLineItem[];
}

export interface ScanError {
  message: string;
  retryable: boolean;
}

interface ReceiptScanSessionState {
  photos: string[];
  batch: ReceiptScanBatch | null;
  drafts: DraftRow[] | null;
  extracting: boolean;
  extractError: ScanError | null;

  addPhoto: (dataUrl: string) => void;
  removePhoto: (index: number) => void;
  /** Extracts every receipt across the captured photos, resolves category/account per Addendum §5/§6, and persists batch + drafts + line items to Supabase immediately — a review session is real, resumable, reviewable-by-anyone-in-the-household data from the moment extraction succeeds, not something held only in this tab's memory. */
  runExtraction: (input: { householdId: string; userId: string; categories: FinanceCategory[]; categoryRules: CategoryRule[]; accounts: Account[] }) => Promise<void>;
  /**
   * Hydrates this session from a batch that already exists in Supabase —
   * the counterpart to runExtraction's "camera just produced this" path.
   * Lets Bulk Statement Review resume any pending batch by ID (e.g. one a
   * bulk historical-CSV import seeded directly, or one abandoned mid-review
   * in an earlier tab), not just whatever this tab's own camera flow just
   * created. Only pending drafts are loaded — confirmed/dismissed ones have
   * nothing left to review.
   */
  loadBatch: (batchId: string) => Promise<{ ok: boolean; error?: string }>;
  updateDraft: (draftId: string, patch: Partial<ScannedTransactionDraft>) => void;
  updateLineItem: (lineItemId: string, patch: Partial<ScannedReceiptLineItem>) => void;
  dismissDraft: (draftId: string) => void;
  reset: () => void;
}

export const useReceiptScanSession = create<ReceiptScanSessionState>()((set, get) => ({
  photos: [],
  batch: null,
  drafts: null,
  extracting: false,
  extractError: null,

  addPhoto: (dataUrl) => set((s) => ({ photos: [...s.photos, dataUrl] })),
  removePhoto: (index) => set((s) => ({ photos: s.photos.filter((_, i) => i !== index) })),

  runExtraction: async ({ householdId, userId, categories, categoryRules, accounts }) => {
    set({ extracting: true, extractError: null });
    const supabase = getSupabaseBrowserClient();
    const photos = get().photos;

    let extracted: ReceiptExtraction[];
    try {
      extracted = await visionProvider.extractReceipts(photos);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't analyze your receipt.";
      const retryable = error instanceof VisionDetectionError ? error.retryable : true;
      set({ extracting: false, extractError: { message, retryable } });
      return;
    }

    try {
      // Upload every captured photo to the shared "attachments" bucket
      // first — the batch row references real Storage paths, not data
      // URLs kept only in this tab's memory (Addendum §6's permanent-
      // retention resolution applies to the source images too, not just
      // the confirmed transaction's own copy).
      const batchId = newId();
      const sourceImagePaths = await Promise.all(
        photos.map(async (dataUrl, i) => {
          const path = `${householdId}/receipt-scan-${batchId}-${i}`;
          const blob = await (await fetch(dataUrl)).blob();
          const { error } = await supabase.storage.from("attachments").upload(path, blob, { contentType: blob.type || "image/jpeg" });
          if (error) throw error;
          return path;
        })
      );

      const batch: ReceiptScanBatch = {
        id: batchId,
        householdId,
        sourceImagePaths,
        status: "ready_for_review",
        detectedCount: extracted.length,
        confirmedCount: 0,
        createdByUserId: userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const { error: batchError } = await supabase.from("receipt_scan_batches").insert(receiptScanBatchToInsertRow(batch));
      if (batchError) throw batchError;

      const draftRows: DraftRow[] = extracted.map((receipt, photoIndex) => {
        const category = resolveCategory(receipt.store, "merchant", categoryRules, categories);
        const account = resolveAccountByCardLastFour(receipt.card_last_four, accounts);
        const receiptConfidence = receipt.items.length > 0 ? avg(receipt.items.map((it) => it.confidence)) : 0.7;
        const { needsReview, reviewReason } = draftNeedsReview(receiptConfidence, category, account);

        const draft: ScannedTransactionDraft = {
          id: newId(),
          householdId,
          batchId,
          store: receipt.store || null,
          suggestedDate: receipt.date || null,
          subtotalCents: toCents(receipt.subtotal),
          taxCents: toCents(receipt.tax),
          suggestedAmountCents: toCents(receipt.total),
          suggestedCategoryId: category.categoryId,
          categorySource: category.source,
          confidence: round2(receiptConfidence),
          needsReview,
          reviewReason: reviewReason ?? null,
          boundingBox: null,
          photoIndex,
          status: "pending",
          resultingTransactionId: null,
          accountId: account.accountId,
        };

        const lineItems: ScannedReceiptLineItem[] = receipt.items.map((it) => {
          const itemCategory = resolveCategory(it.category_guess, "description", categoryRules, categories);
          return {
            id: newId(),
            householdId,
            draftId: draft.id,
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

        return { ...draft, lineItems };
      });

      const { error: draftsError } = await supabase
        .from("scanned_transaction_drafts")
        .insert(draftRows.map((d) => scannedTransactionDraftToInsertRow(d)));
      if (draftsError) throw draftsError;

      const allLineItems = draftRows.flatMap((d) => d.lineItems);
      if (allLineItems.length > 0) {
        const { error: lineItemsError } = await supabase
          .from("scanned_receipt_line_items")
          .insert(allLineItems.map(scannedReceiptLineItemToInsertRow));
        if (lineItemsError) throw lineItemsError;
      }

      set({ extracting: false, batch, drafts: draftRows });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't save the scanned receipt.";
      set({ extracting: false, extractError: { message, retryable: true } });
    }
  },

  loadBatch: async (batchId) => {
    const supabase = getSupabaseBrowserClient();

    const { data: batchRow, error: batchError } = await supabase
      .from("receipt_scan_batches")
      .select("*")
      .eq("id", batchId)
      .single();
    if (batchError || !batchRow) return { ok: false, error: batchError?.message ?? "Batch not found." };

    const { data: draftRows, error: draftsError } = await supabase
      .from("scanned_transaction_drafts")
      .select("*")
      .eq("batch_id", batchId)
      .eq("status", "pending");
    if (draftsError) return { ok: false, error: draftsError.message };

    const draftIds = (draftRows ?? []).map((d) => d.id);
    const { data: lineItemRows, error: lineItemsError } =
      draftIds.length > 0
        ? await supabase.from("scanned_receipt_line_items").select("*").in("draft_id", draftIds)
        : { data: [], error: null };
    if (lineItemsError) return { ok: false, error: lineItemsError.message };

    const drafts: DraftRow[] = (draftRows ?? []).map((row) => {
      const draft = rowToScannedTransactionDraft(row);
      const lineItems = (lineItemRows ?? []).filter((li) => li.draft_id === draft.id).map(rowToScannedReceiptLineItem);
      return { ...draft, lineItems };
    });

    set({ batch: rowToReceiptScanBatch(batchRow), drafts, photos: [] });
    return { ok: true };
  },

  updateDraft: (draftId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const drafts = get().drafts;
    if (!drafts) return;
    const previous = drafts.find((d) => d.id === draftId);
    if (!previous) return;
    const merged: DraftRow = { ...previous, ...patch };
    set({ drafts: drafts.map((d) => (d.id === draftId ? merged : d)) });
    supabase
      .from("scanned_transaction_drafts")
      .update(scannedTransactionDraftToInsertRow(merged))
      .eq("id", draftId)
      .then(({ error }) => {
        if (error) {
          set((s) => ({ drafts: (s.drafts ?? []).map((d) => (d.id === draftId ? previous : d)) }));
          console.error("Couldn't update draft:", error.message);
        }
      });
  },

  updateLineItem: (lineItemId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const drafts = get().drafts;
    if (!drafts) return;
    let previous: ScannedReceiptLineItem | undefined;
    const next = drafts.map((d) => {
      const item = d.lineItems.find((li) => li.id === lineItemId);
      if (!item) return d;
      previous = item;
      return { ...d, lineItems: d.lineItems.map((li) => (li.id === lineItemId ? { ...li, ...patch } : li)) };
    });
    if (!previous) return;
    const merged = { ...previous, ...patch };
    set({ drafts: next });
    supabase
      .from("scanned_receipt_line_items")
      .update(scannedReceiptLineItemToInsertRow(merged))
      .eq("id", lineItemId)
      .then(({ error }) => {
        if (error) console.error("Couldn't update line item:", error.message);
      });
  },

  dismissDraft: (draftId) => {
    get().updateDraft(draftId, { status: "dismissed" });
  },

  reset: () => set({ photos: [], batch: null, drafts: null, extracting: false, extractError: null }),
}));

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
