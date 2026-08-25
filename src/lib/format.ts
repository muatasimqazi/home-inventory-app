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
export function parseCalendarDate(iso: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return new Date(iso);
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatDate(iso: string): string {
  return parseCalendarDate(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** parseCalendarDate's inverse: a local Date -> "YYYY-MM-DD". `.toISOString()` isn't this — it converts to UTC first, which shifts the calendar day for anyone west of UTC. Originally private to the Budget page (building a month's from/to for a "view these transactions" link); moved here once Dashboard's own "Spending by Category" needed the exact same thing. */
export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * "Today" as a plain YYYY-MM-DD, in a specific IANA zone (Member.timezone,
 * Settings > your profile) if given, else whatever zone this device/
 * browser is already in. For anything that needs to default a date to
 * "today" in a way that means the *user's* calendar day — not the
 * server's (Vercel/Supabase both run UTC) and not a naive
 * `new Date().toISOString().slice(0,10)`, which is exactly the UTC "today"
 * this function exists to avoid. First real caller: finance/scan/review/
 * page.tsx passes this to confirm_scanned_transaction_draft as the
 * fallback for a receipt whose date the AI couldn't read at all — the
 * RPC's own `current_date` fallback runs on Postgres' session clock
 * (UTC), which could land on the wrong day by itself, same underlying
 * class of bug as parseCalendarDate exists to fix on the read side.
 */
export function getLocalTodayIso(timezone?: string | null): string {
  const opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
  try {
    // en-CA formats as YYYY-MM-DD — a locale chosen for its date format,
    // not because it's meaningful to the user (nothing here is displayed).
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: timezone || undefined }).format(new Date());
  } catch {
    // Invalid/unrecognized IANA zone string — fall back to this device's
    // own zone rather than throwing and blocking whatever flow called this.
    return new Intl.DateTimeFormat("en-CA", opts).format(new Date());
  }
}

// A short, common-case fallback for the rare browser without
// Intl.supportedValuesOf (older Safari/Firefox) — not exhaustive, just
// enough that the timezone picker isn't empty there.
const FALLBACK_TIMEZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Every IANA zone name this browser knows about, for the Settings timezone picker. */
export function listTimeZones(): string[] {
  try {
    if (typeof Intl.supportedValuesOf === "function") return Intl.supportedValuesOf("timeZone");
  } catch {
    // fall through to the fallback list below
  }
  return FALLBACK_TIMEZONES;
}

/** This device's own detected zone (Intl's own resolved default) — used as the placeholder/preview for the "Automatic" option in the timezone picker. */
export function detectedTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
