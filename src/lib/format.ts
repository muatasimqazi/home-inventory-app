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

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

/** "Aug 17" — Finance's transaction/bill date grain (dates, not full timestamps). Distinct from formatDate() above, which includes a year for inventory's longer-lived records. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
