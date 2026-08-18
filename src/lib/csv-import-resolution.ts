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

export interface CsvImportCandidate {
  accountId: string;
  amount: number;
  occurredAt: string;
  description: string;
}

/** Returns the first existing (non-trashed) transaction this candidate row looks like a duplicate of, or null if none match all three criteria. */
export function findDuplicateTransaction(candidate: CsvImportCandidate, existing: Transaction[]): Transaction | null {
  return (
    existing.find((t) => {
      if (t.trashedAt) return false;
      if (t.accountId !== candidate.accountId) return false;
      if (t.amount !== candidate.amount) return false;
      if (daysBetween(t.occurredAt, candidate.occurredAt) > DATE_WINDOW_DAYS) return false;
      const existingText = t.merchant ?? t.description ?? "";
      return descriptionSimilarity(existingText, candidate.description) >= SIMILARITY_THRESHOLD;
    }) ?? null
  );
}
