"use client";

import { findDuplicateTransaction, descriptionSimilarity } from "@/lib/csv-import-resolution";
import { parseCalendarDate } from "@/lib/format";
import type { ScannedTransactionDraft, Transaction } from "@/lib/types";

export interface PossibleDuplicateMatch {
  transaction: Transaction;
  /** Set when the match came from the AI fallback (part B) — the model's own explanation, shown to the person reviewing it. Null for a deterministic match (part A) — that one's self-evident from the numbers already on screen. */
  reasoning: string | null;
}

const LOOSE_WINDOW_DAYS = 3;
const LOOSE_AMOUNT_TOLERANCE_PERCENT = 50;
const LOOSE_SIMILARITY_MIN = 0.4;
const LOOSE_SIMILARITY_MAX = 0.8; // findDuplicateTransaction's own threshold — anything at/above this, the deterministic pass already would have caught
const MAX_AI_CANDIDATES = 5;
const AI_CONFIDENCE_MIN = 0.5;

function draftAmount(draft: ScannedTransactionDraft): number {
  // A receipt is always money out — same sign convention
  // confirm_scanned_transaction_draft's own SQL uses.
  return -Math.abs((draft.suggestedAmountCents ?? 0) / 100);
}

function looseCandidates(draft: ScannedTransactionDraft, transactions: Transaction[]): Transaction[] {
  if (!draft.accountId) return [];
  const amount = draftAmount(draft);
  const merchant = draft.store ?? "";
  const occurredAt = draft.suggestedDate ?? new Date().toISOString().slice(0, 10);
  const draftDate = parseCalendarDate(occurredAt);

  return transactions
    .filter((t) => {
      if (t.trashedAt || t.accountId !== draft.accountId) return false;
      const days = Math.abs(parseCalendarDate(t.occurredAt).getTime() - draftDate.getTime()) / (1000 * 60 * 60 * 24);
      if (days > LOOSE_WINDOW_DAYS) return false;
      const sameSign = Math.sign(t.amount) === Math.sign(amount);
      const amountClose = sameSign && Math.abs(Math.abs(t.amount) - Math.abs(amount)) / Math.max(Math.abs(t.amount), Math.abs(amount), 1) <= LOOSE_AMOUNT_TOLERANCE_PERCENT / 100;
      const similarity = descriptionSimilarity(t.merchant ?? t.description ?? "", merchant);
      const similarityInRange = similarity >= LOOSE_SIMILARITY_MIN && similarity < LOOSE_SIMILARITY_MAX;
      return amountClose || similarityInRange;
    })
    .slice(0, MAX_AI_CANDIDATES);
}

/**
 * Duplicate-transaction prevention, part C — run before confirming a
 * receipt-scan draft into a transaction, so a charge the bank already
 * reported doesn't get double-counted. Deterministic pass first (part A,
 * tolerant amount matching) — free, instant. Only when that finds
 * nothing does this fall back to the AI matcher (part B) via
 * /api/v1/finance/match-transaction, and only if a real "maybe" candidate
 * exists at all — no candidates, no model call.
 *
 * Never merges anything itself — returns what it found so the caller can
 * show a human-confirmed prompt (part C's UI), the same posture the
 * deterministic and AI paths both share throughout this feature.
 */
export async function findPossibleDuplicateForDraft(draft: ScannedTransactionDraft, transactions: Transaction[]): Promise<PossibleDuplicateMatch | null> {
  if (!draft.accountId) return null;
  const amount = draftAmount(draft);
  const merchant = draft.store ?? "";
  const occurredAt = draft.suggestedDate ?? new Date().toISOString().slice(0, 10);

  const exact = findDuplicateTransaction({ accountId: draft.accountId, amount, occurredAt, description: merchant }, transactions, { amountTolerancePercent: 30 });
  if (exact) return { transaction: exact, reasoning: null };

  const candidates = looseCandidates(draft, transactions);
  if (candidates.length === 0) return null;

  try {
    const res = await fetch("/api/v1/finance/match-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: { merchant, amount, occurredAt },
        options: candidates.map((t) => ({ id: t.id, merchant: t.merchant ?? t.description ?? "Transaction", amount: t.amount, occurredAt: t.occurredAt })),
      }),
    });
    if (!res.ok) return null; // AI fallback failing is not itself an error worth surfacing — the deterministic pass already ran, this is a bonus
    const { result } = (await res.json()) as { result: { matchedTransactionId: string | null; confidence: number; reasoning: string } | null };
    if (!result || !result.matchedTransactionId || result.confidence < AI_CONFIDENCE_MIN) return null;
    const matched = candidates.find((t) => t.id === result.matchedTransactionId);
    if (!matched) return null;
    return { transaction: matched, reasoning: result.reasoning };
  } catch {
    return null;
  }
}
