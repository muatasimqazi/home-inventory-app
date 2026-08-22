import type { RecurringBillFrequency, RecurringBill } from "@/lib/types";
import type { StatementTransactionExtraction } from "@/lib/ai";

export interface RecurringCandidate {
  /** Stable within one detection run — the normalized merchant key. */
  id: string;
  merchantName: string;
  frequency: RecurringBillFrequency;
  /** The most recent occurrence's amount — statements sometimes show a small price change (a subscription bump), so "most recent" is a better predictor of what's due next than an average. */
  expectedAmount: number;
  /** Estimated from the most recent occurrence + one cycle at this frequency. */
  nextDueDate: string;
  /** How many times this pattern showed up on the statement — always >= 2 (a single occurrence can't establish a cadence). */
  occurrenceCount: number;
  lastOccurrence: string;
  /** True when an existing RecurringBill already has this same normalized name — surfaced so the review screen can default it unchecked instead of proposing a duplicate. */
  alreadyTracked: boolean;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

// [min, max] gap-in-days windows a frequency's *typical* cadence falls
// into, generous enough to absorb a bill landing on a weekend/holiday a
// few days early or late without missing the pattern, tight enough that
// weekly and biweekly (or monthly and quarterly) don't bleed into each
// other.
const FREQUENCY_WINDOWS: { frequency: RecurringBillFrequency; min: number; max: number }[] = [
  { frequency: "weekly", min: 5, max: 9 },
  { frequency: "biweekly", min: 12, max: 16 },
  { frequency: "monthly", min: 25, max: 35 },
  { frequency: "quarterly", min: 80, max: 100 },
  { frequency: "yearly", min: 350, max: 380 },
];

export const FREQUENCY_DAYS: Record<RecurringBillFrequency, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

/** Noon-anchors a bare "YYYY-MM-DD" so it round-trips through any timezone without shifting a day (see the call site's comment). Falls back to the raw string on anything that doesn't parse — an occasional malformed date from the model shouldn't crash the whole detection pass, just fail to match a pattern gracefully like it always did before this normalization existed. */
export function toNoonIso(dateOnly: string): string {
  const d = new Date(`${dateOnly}T12:00:00`);
  return Number.isNaN(d.getTime()) ? dateOnly : d.toISOString();
}

/** Loose enough to match "NETFLIX.COM", "NETFLIX.COM 855-4491", "Netflix.com*Sub" as the same merchant, without collapsing genuinely different merchants into one. Strips trailing reference numbers/phone numbers and non-letters, lowercases, trims. Exported — reused as-is by lib/recurring-transaction-detection.ts (the transaction-history variant of this same detector) so both share one definition of "same merchant." */
export function normalizeMerchant(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\d{3,}/g, "") // drop long digit runs — reference/phone numbers, not part of the merchant's identity
    .replace(/[^a-z\s]/g, " ") // punctuation/symbols to spaces
    .replace(/\s+/g, " ")
    .trim();
}

/** How close two amounts are, as a fraction of the larger — a subscription price bump ($15.49 -> $16.49) should still read as "the same bill," a coincidentally-similar one-off purchase shouldn't. */
export function amountsClose(a: number, b: number): boolean {
  const diff = Math.abs(Math.abs(a) - Math.abs(b));
  const larger = Math.max(Math.abs(a), Math.abs(b));
  if (larger === 0) return diff === 0;
  return diff / larger <= 0.15 || diff <= 3; // whichever's more forgiving for small-dollar bills
}

export function classifyFrequency(gapDays: number[]): RecurringBillFrequency | null {
  const avgGap = gapDays.reduce((a, b) => a + b, 0) / gapDays.length;
  for (const window of FREQUENCY_WINDOWS) {
    if (avgGap >= window.min && avgGap <= window.max) {
      // Every individual gap has to land in the same window too, not just
      // the average — two occurrences 10 and 50 days apart average to a
      // plausible "monthly" gap while describing no real cadence at all.
      if (gapDays.every((g) => g >= window.min - 3 && g <= window.max + 3)) return window.frequency;
    }
  }
  return null;
}

/**
 * Groups a statement's extracted transactions by merchant, looks for ones
 * that recur on a recognizable cadence with a consistent amount, and
 * returns each as a reviewable candidate — never auto-creates a
 * RecurringBill directly. Deliberately conservative: only charges
 * (negative amount) are considered (a recurring *payment received* isn't
 * a bill), and a pattern needs at least 2 occurrences with gaps that all
 * land in one frequency's window, not just an average that happens to.
 */
export function detectRecurringCandidates(
  transactions: StatementTransactionExtraction[],
  existingBills: RecurringBill[]
): RecurringCandidate[] {
  const existingNames = new Set(existingBills.map((b) => normalizeMerchant(b.name)));

  const groups = new Map<string, { displayName: string; entries: StatementTransactionExtraction[] }>();
  for (const raw of transactions) {
    if (raw.amount >= 0) continue; // only charges can be a recurring bill
    const key = normalizeMerchant(raw.merchant);
    if (!key) continue;
    // Bare "YYYY-MM-DD" (what the extraction schema asks for) parses as
    // UTC midnight — in any timezone behind UTC that displays as the day
    // *before* once rendered (a live test caught exactly this: a real
    // "2026-08-01" charge showed as "Jul 31"). Noon-anchor immediately on
    // ingestion, same fix already used for bare dates in
    // transaction-form-sheet.tsx/recurring-bill-form-sheet.tsx/CSV import's
    // parseDate(), so every date this module hands back (lastOccurrence,
    // nextDueDate) is a real timezone-safe ISO timestamp from here on.
    const t = { ...raw, date: toNoonIso(raw.date) };
    const group = groups.get(key);
    if (group) group.entries.push(t);
    else groups.set(key, { displayName: raw.merchant.trim(), entries: [t] });
  }

  const candidates: RecurringCandidate[] = [];
  for (const [key, { displayName, entries }] of groups) {
    if (entries.length < 2) continue;
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Amounts must all be mutually close to the most recent one — one
    // outlier (a different-priced item that happened to share a merchant
    // name) shouldn't disqualify an otherwise-clear pattern, but nothing
    // wildly different should be folded in either.
    const mostRecent = sorted[sorted.length - 1];
    if (!sorted.every((e) => amountsClose(e.amount, mostRecent.amount))) continue;

    const gapDays = sorted.slice(1).map((e, i) => Math.round((new Date(e.date).getTime() - new Date(sorted[i].date).getTime()) / DAY_MS));
    const frequency = classifyFrequency(gapDays);
    if (!frequency) continue;

    const nextDueDate = new Date(new Date(mostRecent.date).getTime() + FREQUENCY_DAYS[frequency] * DAY_MS).toISOString();

    candidates.push({
      id: key,
      merchantName: displayName,
      frequency,
      expectedAmount: Math.abs(mostRecent.amount),
      nextDueDate,
      occurrenceCount: sorted.length,
      lastOccurrence: mostRecent.date,
      alreadyTracked: existingNames.has(key),
    });
  }

  // Most-occurrences-first — the clearest patterns (more evidence) lead
  // the review list rather than whatever order Map iteration happened to
  // produce.
  return candidates.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}
