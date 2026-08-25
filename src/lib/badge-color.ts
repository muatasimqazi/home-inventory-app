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

// Finance category color — the same 5-role FAB chooser-wheel palette
// (globals.css's --color-fab-* tokens: Sage/Gold/Terracotta/Charcoal/Teal,
// all paired with a white foreground — see that file's own comment on why
// Secondary/Neutral Light were deepened to support white) hashed per
// category instead of BADGE_PALETTE's pastel set. A household can have
// many more than 5 categories (defaults plus whatever it adds), so this
// still repeats hues the same way BADGE_PALETTE already does for
// containers — solid, brand-consistent color reads distinctly at a
// glance even when two categories land on the same hue, which a flat
// neutral badge everywhere never did.
const CATEGORY_PALETTE = ["bg-fab-primary", "bg-fab-secondary", "bg-fab-accent", "bg-fab-neutral-dark", "bg-fab-neutral-light"] as const;

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

/** `bg-fab-* text-white` hashed per category id — see CATEGORY_PALETTE's own comment. */
export function categoryBadgeClasses(key: string): string {
  return `${CATEGORY_PALETTE[hashKey(key) % CATEGORY_PALETTE.length]} text-white`;
}
