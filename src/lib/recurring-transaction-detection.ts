import type { RecurringBill, RecurringBillFrequency, RecurringCandidateDismissal, Transaction } from "./types";
import { DAY_MS, FREQUENCY_DAYS, amountsClose, classifyFrequency, normalizeMerchant } from "./recurring-detection";

// AI recurring-bill detection over a household's own transaction history
// (Workstream 4 of the multi-batch feature set) — distinct from, but
// deliberately built on top of, lib/recurring-detection.ts's statement-
// import detector. That module already solves "is this the same amount
// roughly every 28-31 days" well with a plain deterministic heuristic
// (merchant normalization + amount tolerance + gap-window classification)
// — an LLM call would add latency, cost, and a new failure mode without
// improving on arithmetic over dates and amounts the code already does
// reliably. This module reuses those same matching primitives
// (normalizeMerchant/amountsClose/classifyFrequency/FREQUENCY_DAYS)
// rather than duplicating them, and only adds what's different about
// scanning real transactions instead of a freshly-extracted statement:
// - grouping is scoped per *account* too, not just merchant name, since
//   a real household can have the same merchant charged to two different
//   cards as two genuinely separate bills;
// - each candidate carries the real Transaction rows it's based on (ids,
//   dates, amounts) so the review UI can show its evidence, not just an
//   aggregate;
// - already-dismissed candidates (recurring_candidate_dismissals, see
//   0025_recurring_candidate_dismissals.sql) are filtered out so a
//   "not recurring" verdict sticks across runs instead of reappearing
//   every time the review screen loads.

export interface TransactionRecurringCandidate {
  /** Stable within one household's data: `${accountId}:${candidateKey}` — matches dismissalFullKey()'s format. */
  id: string;
  accountId: string;
  /** The normalized-merchant half of `id` on its own — what dismissRecurringCandidate(accountId, candidateKey) (lib/store.ts) expects as its second argument. */
  candidateKey: string;
  merchantName: string;
  frequency: RecurringBillFrequency;
  /** The most recent occurrence's amount — a subscription price bump is a better predictor of what's due next than an average. */
  expectedAmount: number;
  /** Estimated from the most recent occurrence + one cycle at this frequency. */
  nextDueDate: string;
  occurrenceCount: number;
  lastOccurrence: string;
  /** True when an existing RecurringBill already covers this same normalized name — surfaced so the review screen can default it unchecked instead of proposing a duplicate. */
  alreadyTracked: boolean;
  /** The real transactions this candidate is based on (most recent first) — the "actual transactions it's based on" the review UI shows per candidate. */
  matchingTransactions: Pick<Transaction, "id" | "occurredAt" | "amount" | "merchant" | "description">[];
}

/** Same `${accountId}:${candidateKey}` composite a TransactionRecurringCandidate.id is, built from a stored RecurringCandidateDismissal row — the shared key format both the API route and the review UI use to check "has this already been dismissed." */
export function dismissalFullKey(d: Pick<RecurringCandidateDismissal, "accountId" | "candidateKey">): string {
  return `${d.accountId}:${d.candidateKey}`;
}

/**
 * Groups a household's own posted charge transactions by account+merchant,
 * looks for ones recurring on a recognizable cadence with a consistent
 * amount, and returns each as a reviewable candidate — never auto-creates
 * a RecurringBill directly (assisted-with-confirmation, same posture as
 * the statement-import detector and the rest of this app's AI features).
 *
 * Deliberately conservative, same rules as the statement-import detector:
 * only charges (negative amount) count, transfers/payments between the
 * household's own accounts are excluded (linkedTransactionId set), a
 * pattern needs at least 2 occurrences with gaps that all land in one
 * frequency's window, and trashed transactions never count as evidence.
 */
export function detectRecurringFromTransactions(
  transactions: Transaction[],
  existingBills: RecurringBill[],
  dismissedCandidateKeys: ReadonlySet<string>
): TransactionRecurringCandidate[] {
  // Scoped per account, matching this module's own per-account+merchant
  // grouping below — a same-named bill tracked on a different account is
  // NOT "already tracked" for this one (the module's own doc comment:
  // "the same merchant charged to two different cards as two genuinely
  // separate bills"). A bill with no accountId of its own (not tied to a
  // specific payment account) is treated as covering any account it might
  // show up on, so it still suppresses a real match there.
  const existingActiveBills = existingBills.filter((b) => b.trashedAt === null);
  const existingByAccount = new Set(
    existingActiveBills.filter((b) => b.accountId !== null).map((b) => `${b.accountId}:${normalizeMerchant(b.name)}`)
  );
  const existingAnyAccount = new Set(existingActiveBills.filter((b) => b.accountId === null).map((b) => normalizeMerchant(b.name)));

  const groups = new Map<string, { accountId: string; candidateKey: string; displayName: string; entries: Transaction[] }>();
  for (const t of transactions) {
    if (t.trashedAt !== null) continue;
    if (t.amount >= 0) continue; // only charges can be a recurring bill
    if (t.linkedTransactionId !== null) continue; // a transfer/payment leg, not a bill charge
    if (!t.merchant) continue;
    const merchantKey = normalizeMerchant(t.merchant);
    if (!merchantKey) continue;
    const key = `${t.accountId}:${merchantKey}`;
    const group = groups.get(key);
    if (group) group.entries.push(t);
    else groups.set(key, { accountId: t.accountId, candidateKey: merchantKey, displayName: t.merchant.trim(), entries: [t] });
  }

  const candidates: TransactionRecurringCandidate[] = [];
  for (const [key, { accountId, candidateKey, displayName, entries }] of groups) {
    if (dismissedCandidateKeys.has(key)) continue;
    if (entries.length < 2) continue;
    const sorted = [...entries].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

    // Amounts must all be mutually close to the most recent one — one
    // outlier (a different-priced item that happened to share a merchant
    // name) shouldn't disqualify an otherwise-clear pattern.
    const mostRecent = sorted[sorted.length - 1];
    if (!sorted.every((e) => amountsClose(e.amount, mostRecent.amount))) continue;

    const gapDays = sorted.slice(1).map((e, i) => Math.round((new Date(e.occurredAt).getTime() - new Date(sorted[i].occurredAt).getTime()) / DAY_MS));
    const frequency = classifyFrequency(gapDays);
    if (!frequency) continue;

    const nextDueDate = new Date(new Date(mostRecent.occurredAt).getTime() + FREQUENCY_DAYS[frequency] * DAY_MS).toISOString();

    candidates.push({
      id: key,
      accountId,
      candidateKey,
      merchantName: displayName,
      frequency,
      expectedAmount: Math.abs(mostRecent.amount),
      nextDueDate,
      occurrenceCount: sorted.length,
      lastOccurrence: mostRecent.occurredAt,
      alreadyTracked: existingByAccount.has(`${accountId}:${normalizeMerchant(displayName)}`) || existingAnyAccount.has(normalizeMerchant(displayName)),
      matchingTransactions: [...sorted].reverse().map((t) => ({ id: t.id, occurredAt: t.occurredAt, amount: t.amount, merchant: t.merchant, description: t.description })),
    });
  }

  // Most-occurrences-first — the clearest patterns (more evidence) lead
  // the review list rather than whatever order Map iteration happened to
  // produce.
  return candidates.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
