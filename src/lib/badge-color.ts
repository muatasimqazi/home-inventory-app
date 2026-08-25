// Container ID badge palette (Figma v2 Dashboard, node 220:2/220:4) — flat
// pastel fill + border + deep text, hashed per container so each one reads
// as a distinct color, never a single neutral-gray badge everywhere.
const BADGE_PALETTE = [
  { bg: "bg-badge-red-bg", border: "border-badge-red-border", text: "text-badge-red-text" },
  { bg: "bg-badge-green-bg", border: "border-badge-green-border", text: "text-badge-green-text" },
  { bg: "bg-badge-purple-bg", border: "border-badge-purple-border", text: "text-badge-purple-text" },
  { bg: "bg-badge-orange-bg", border: "border-badge-orange-border", text: "text-badge-orange-text" },
  { bg: "bg-badge-blue-bg", border: "border-badge-blue-border", text: "text-badge-blue-text" },
] as const;

// Same 5 hues as BADGE_PALETTE above, in the same order, but as the raw
// `--color-badge-*-text` CSS var name rather than a Tailwind class — for
// spots that need an actual color value (an SVG `stroke`, say) instead of
// a className. Keeping the order identical to BADGE_PALETTE means the
// same key always hashes to visually the same hue in both places.
const BADGE_TEXT_VARS = ["--color-badge-red-text", "--color-badge-green-text", "--color-badge-purple-text", "--color-badge-orange-text", "--color-badge-blue-text"] as const;

function hashKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return hash;
}

export function displayCodeBadgeClasses(key: string): string {
  const { bg, border, text } = BADGE_PALETTE[hashKey(key) % BADGE_PALETTE.length];
  return `${bg} ${border} ${text}`;
}

/** The `--color-badge-*-text` CSS var name (not a className) for the same hashed hue displayCodeBadgeClasses(key) would use — for a spot that needs a real color value, e.g. an SVG `stroke`. */
export function badgeColorVar(key: string): string {
  return BADGE_TEXT_VARS[hashKey(key) % BADGE_TEXT_VARS.length];
}
