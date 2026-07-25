import type { Container } from "./types";

// Bin ID / display code helpers (PRD v2 §2). Separate from tagToken: this is
// the short, human-printable code (e.g. GAR-234), not the QR/NFC resolver.

/** First 3 letters of the location name, uppercased, padded with X. */
export function locationPrefix(locationName: string): string {
  const letters = locationName.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters + "XXX").slice(0, 3);
}

export function normalizeDisplayCode(input: string): string {
  return input.trim().toUpperCase();
}

export function isDisplayCodeTaken(containers: Container[], code: string, excludeContainerId?: string): boolean {
  const normalized = normalizeDisplayCode(code);
  return containers.some(
    (c) => c.id !== excludeContainerId && c.displayCode && normalizeDisplayCode(c.displayCode) === normalized
  );
}

/** Next unused sequential code for a location's prefix, e.g. GAR-001, GAR-002, ... */
export function nextDisplayCode(containers: Container[], locationName: string): string {
  const prefix = locationPrefix(locationName);
  let max = 0;
  for (const c of containers) {
    if (!c.displayCode) continue;
    const match = c.displayCode.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = String(max + 1).padStart(3, "0");
  return `${prefix}-${next}`;
}
