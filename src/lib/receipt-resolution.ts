// Category and account resolution for scanned receipts (docs/Receipt
// Scanning Addendum.md §5/§6). Pure functions, no store/network
// dependency, so receipt-scan-session-store.ts's runExtraction() can call
// them directly with whatever categories/rules/accounts the caller
// already has from useInventoryStore — same division of responsibility
// capture-session-store.ts uses (the session store owns capture/extract
// state, resolution logic against household data is a separate,
// independently testable layer).

import type { Account, CategoryRule, FinanceCategory } from "./types";
import { REVIEW_THRESHOLD } from "./ai";

export interface CategoryResolution {
  categoryId: string | null;
  source: "rule_match" | "ai_suggestion" | null;
  confidence: number;
}

/**
 * Category resolution order (Addendum §5), applied identically for a
 * transaction's own category (merchant-driven) and per line item
 * (guess-driven):
 * 1. An existing category_rules match → apply directly, high effective
 *    confidence (a rule is a stronger signal than a fresh AI guess).
 * 2. No rule match → fall back to the AI's own guess (matched by name
 *    against real categories, case-insensitively), subject to
 *    REVIEW_THRESHOLD.
 * 3. Neither resolves → null category, confidence 0 (review will offer a
 *    picker; §5's "user corrects → learns a rule" happens at that point,
 *    not here).
 */
export function resolveCategory(
  matchText: string, // merchant name (transaction-level) or category_guess (line-item-level)
  matchField: "merchant" | "description",
  rules: CategoryRule[],
  categories: FinanceCategory[]
): CategoryResolution {
  const normalized = matchText.trim().toLowerCase();
  if (!normalized) return { categoryId: null, source: null, confidence: 0 };

  const ruleMatch = rules.find((r) => {
    if (r.matchField !== matchField) return false;
    const value = r.matchValue.trim().toLowerCase();
    return r.matchType === "exact" ? normalized === value : normalized.includes(value);
  });
  if (ruleMatch) {
    return { categoryId: ruleMatch.categoryId, source: "rule_match", confidence: 0.99 };
  }

  const guessMatch = categories.find((c) => c.status === "active" && c.name.trim().toLowerCase() === normalized);
  if (guessMatch) {
    // AI text-matched a real category by name — a clean match is treated
    // as reasonably confident (comfortably above REVIEW_THRESHOLD) since
    // the ambiguity that would actually warrant review is "did this guess
    // resolve to a real category at all," not "how sure is the model
    // about a name it read directly off the receipt."
    return { categoryId: guessMatch.id, source: "ai_suggestion", confidence: 0.85 };
  }

  return { categoryId: null, source: null, confidence: 0 };
}

export type AccountMatchState = "matched" | "none" | "ambiguous";

export interface AccountResolution {
  accountId: string | null;
  matchState: AccountMatchState;
}

/**
 * Which account pays (Addendum §6) — match the receipt's extracted
 * card_last_four against accounts.card_last_four for this household.
 * Exactly one match auto-assigns; zero or multiple both leave accountId
 * null and flag the reason via matchState, never silently guessing
 * between ambiguous candidates.
 */
export function resolveAccountByCardLastFour(cardLastFour: string, accounts: Account[]): AccountResolution {
  const digits = cardLastFour.trim();
  if (!digits) return { accountId: null, matchState: "none" };

  const matches = accounts.filter((a) => a.status === "active" && a.cardLastFour === digits);
  if (matches.length === 1) return { accountId: matches[0].id, matchState: "matched" };
  if (matches.length === 0) return { accountId: null, matchState: "none" };
  return { accountId: null, matchState: "ambiguous" };
}

/**
 * A receipt-level draft needs_review if either the receipt's own
 * extraction confidence or its resolved category confidence is low, the
 * account couldn't be resolved unambiguously, or no line items were
 * extracted at all — matches DetectedItem's withReview() pattern in
 * lib/ai.ts, generalized to the extra signals a receipt has that an
 * inventory item doesn't.
 *
 * `itemCount === 0` gets its own explicit, named reason rather than
 * relying on the confidence check alone — a real receipt hit this: the
 * model correctly read store/date/subtotal/tax/total but returned zero
 * line items, and the resulting draft's confidence (runExtraction()'s own
 * 0.7 fallback for that exact case) happened to fall under
 * REVIEW_THRESHOLD, so it *did* get flagged, but with "Extraction
 * confidence 0.70 is below 0.75" as the only stated reason — true, but
 * useless for telling a household member what's actually wrong or what to
 * do about it (nothing said "no items," and nothing suggested adding them
 * manually, which is the real fix once "Add Item" exists on a confirmed
 * transaction).
 */
export function draftNeedsReview(
  receiptConfidence: number,
  category: CategoryResolution,
  account: AccountResolution,
  itemCount: number
): { needsReview: boolean; reviewReason?: string } {
  const reasons: string[] = [];
  if (itemCount === 0) reasons.push("No items could be identified on this receipt — you can add them manually after confirming.");
  if (receiptConfidence < REVIEW_THRESHOLD) reasons.push(`Extraction confidence ${receiptConfidence.toFixed(2)} is below ${REVIEW_THRESHOLD}.`);
  if (category.categoryId === null) reasons.push("No category could be resolved.");
  if (account.matchState === "ambiguous") reasons.push("Card matches more than one account — pick one.");
  if (account.matchState === "none") reasons.push("No account matched this receipt's card — pick one.");
  return reasons.length > 0 ? { needsReview: true, reviewReason: reasons.join(" ") } : { needsReview: false };
}
