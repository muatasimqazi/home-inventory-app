import type { Container } from "./types";

// Container ID / display code helpers (PRD v2 §2). Separate from tagToken: this is
// the short, human-printable code (e.g. GAR-234), not the QR/NFC resolver.

/** First 3 letters of the location name, uppercased, padded with X. */
export function locationPrefix(locationName: string): string {
  const letters = locationName.toUpperCase().replace(/[^A-Z]/g, "");
  return (letters + "XXX").slice(0, 3);
}

export function normalizeDisplayCode(input: string): string {
  return input.trim().toUpperCase();
}

/**
 * Cleans an arbitrary content-derived prefix (e.g. an AI suggestion) into
 * something safe to build a Container ID from: uppercase, letters only,
 * 2-8 characters. Unlike locationPrefix() (always exactly 3, padded with
 * X — a location name is never empty), a content-based prefix can
 * legitimately fail to clean into anything usable (an empty/all-symbol
 * suggestion), so this returns null rather than silently padding
 * garbage — callers fall back to locationPrefix() in that case.
 */
export function normalizeCodePrefix(input: string): string | null {
  const letters = input.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
  return letters.length >= 2 ? letters : null;
}

export function isDisplayCodeTaken(containers: Container[], code: string, excludeContainerId?: string): boolean {
  const normalized = normalizeDisplayCode(code);
  return containers.some(
    (c) => c.id !== excludeContainerId && c.displayCode && normalizeDisplayCode(c.displayCode) === normalized
  );
}

/**
 * Next unused sequential code for an arbitrary prefix, e.g. TOOLS-001,
 * TOOLS-002, ... — the shared scan-and-increment logic both
 * nextDisplayCode (location-based prefix) and the AI content-based label
 * suggestion (lib/inventory/suggest-container-name.ts) build on, so the
 * numbering scheme itself (3-digit, zero-padded, dash-separated) only
 * lives in one place regardless of where the prefix came from.
 */
export function nextDisplayCodeForPrefix(containers: Container[], prefix: string): string {
  let max = 0;
  for (const c of containers) {
    if (!c.displayCode) continue;
    const match = c.displayCode.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  const next = String(max + 1).padStart(3, "0");
  return `${prefix}-${next}`;
}

/** Next unused sequential code for a location's prefix, e.g. GAR-001, GAR-002, ... */
export function nextDisplayCode(containers: Container[], locationName: string): string {
  return nextDisplayCodeForPrefix(containers, locationPrefix(locationName));
}
