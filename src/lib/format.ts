export function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  const days = Math.floor(diffMs / day);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Every formatDate()/formatShortDate() caller means "this calendar day" —
// a transaction's occurred_at, a warranty end date, a bill's next due date
// — never a precise instant that should shift with the viewer's timezone.
// Almost all of them are backed by a Postgres `date` column or a bare
// "YYYY-MM-DD" string (occurred_at in 0010_finance_schema.sql chief among
// them), and `new Date("2030-01-01")` parses that as *UTC* midnight per
// spec — then .toLocaleDateString() renders it in the *local* timezone,
// silently showing the previous day for anyone west of UTC (Household
// Ledger Implementation Plan §9a: a warranty end entered as 2030-01-01
// displayed as "Dec 31, 2029"). A `new Date(x).toISOString()` round-trip
// (net-worth/page.tsx's trend chart) hits the same bug via a full
// "T00:00:00.000Z" string instead of a bare date, so a regex for the bare
// form alone wouldn't have caught it — reading the leading Y-M-D digits
// directly, regardless of what follows them, does.
//
// The one caller that's a genuine instant, not a calendar date
// (desktop/labels/page.tsx's batch.createdAt, a real `timestamptz`), loses
// timezone-sensitive rendering as a result — accepted deliberately: that's
// a "which day was this label batch created" glance, not a moment anyone
// needs precise to the hour, and it's a small, edge-case-only trade-off
// against a bug that was previously wrong by a day for every finance date
// in the app, every time, for roughly half the world's timezones.
function parseCalendarDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date(iso);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatDate(iso: string): string {
  return parseCalendarDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Signed money: -86.4 -> "-$86.40", 3120 -> "+$3,120.00" (Finance domain — every mockup renders the sign explicitly, not just via color, per accessibility). `showPositiveSign` is off for balances (a positive balance isn't "gained," it just is) and on for transaction amounts. */
export function formatCurrency(amount: number, options?: { showPositiveSign?: boolean }): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString(undefined, { style: "currency", currency: "USD" });
  if (amount < 0) return `-${formatted}`;
  if (options?.showPositiveSign && amount > 0) return `+${formatted}`;
  return formatted;
}

/** "Aug 17" — Finance's transaction/bill date grain (dates, not full timestamps). Distinct from formatDate() above, which includes a year for inventory's longer-lived records. Same calendar-date parsing as formatDate() — see parseCalendarDate()'s comment. */
export function formatShortDate(iso: string): string {
  return parseCalendarDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
