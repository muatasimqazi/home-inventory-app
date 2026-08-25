// CSV import duplicate detection (docs/Personal Finance PRD.md §32.3,
// resolved): same account_id + exact amount + occurred_at within ±2 days
// + normalized-description similarity ≥ 80%. The ±2-day window covers
// the common pending→posted date drift banks introduce; description
// normalization means lowercase + stripped punctuation/whitespace before
// a similarity check — "exact algorithm is an implementation detail, the
// threshold and inputs are the spec" per the PRD, so a plain token-overlap
// (Jaccard) similarity is used here rather than reaching for a dependency.

import type { Transaction } from "./types";

const SIMILARITY_THRESHOLD = 0.8;
const DATE_WINDOW_DAYS = 2;

export function normalizeDescription(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Jaccard similarity over normalized whitespace-tokenized words — 1.0 for identical strings, 0 for no shared tokens. */
export function descriptionSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeDescription(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeDescription(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return intersection / union;
}

function daysBetween(a: string, b: string): number {
  const diffMs = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return diffMs / (1000 * 60 * 60 * 24);
}

/**
 * Exact equality when `tolerancePercent` is 0 (the default every existing
 * caller keeps getting). Above 0: same sign (never matches an expense
 * against an income/refund by accident) and the two magnitudes within
 * `tolerancePercent`% of the larger one — loose enough to absorb a tip,
 * a rounding adjustment, or a small fee between a receipt-scanned amount
 * and the same charge's later Plaid-posted amount, without being loose
 * enough to conflate two genuinely different charges (the ±2-day window
 * and description-similarity check below are the real defense against
 * that, not this alone).
 */
function amountsWithinTolerance(a: number, b: number, tolerancePercent: number): boolean {
  if (tolerancePercent <= 0) return a === b;
  if (Math.sign(a) !== Math.sign(b)) return false;
  const magA = Math.abs(a);
  const magB = Math.abs(b);
  const maxMag = Math.max(magA, magB);
  if (maxMag === 0) return true; // both exactly zero
  return Math.abs(magA - magB) / maxMag <= tolerancePercent / 100;
}

export interface CsvImportCandidate {
  accountId: string;
  amount: number;
  occurredAt: string;
  description: string;
}

export interface FindDuplicateOptions {
  /**
   * 0 (default) = exact amount match, every existing caller's current
   * behavior. Above 0 = allow the two amounts to differ by up to this
   * percent of the larger magnitude (same sign required) — see
   * amountsWithinTolerance's own comment. Deliberately opt-in per call
   * site, not a new default: a wrong auto-merge in CSV import (which
   * has no confirmation step beyond its own review screen) is worse
   * than a missed one, so that caller keeps passing nothing and getting
   * today's exact-match behavior unchanged.
   */
  amountTolerancePercent?: number;
}

/** Returns the first existing (non-trashed) transaction this candidate row looks like a duplicate of, or null if none match all three criteria. */
export function findDuplicateTransaction(candidate: CsvImportCandidate, existing: Transaction[], options?: FindDuplicateOptions): Transaction | null {
  const tolerancePercent = options?.amountTolerancePercent ?? 0;
  return (
    existing.find((t) => {
      if (t.trashedAt) return false;
      if (t.accountId !== candidate.accountId) return false;
      if (!amountsWithinTolerance(t.amount, candidate.amount, tolerancePercent)) return false;
      if (daysBetween(t.occurredAt, candidate.occurredAt) > DATE_WINDOW_DAYS) return false;
      const existingText = t.merchant ?? t.description ?? "";
      return descriptionSimilarity(existingText, candidate.description) >= SIMILARITY_THRESHOLD;
    }) ?? null
  );
}
