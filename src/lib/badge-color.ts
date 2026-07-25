// Bin ID badge palette (Figma v2 Dashboard, node 220:2/220:4) — flat pastel
// fill + border + deep text, hashed per container so each bin reads as a
// distinct color, never a single neutral-gray badge everywhere.
const BADGE_PALETTE = [
  { bg: "bg-badge-red-bg", border: "border-badge-red-border", text: "text-badge-red-text" },
  { bg: "bg-badge-green-bg", border: "border-badge-green-border", text: "text-badge-green-text" },
  { bg: "bg-badge-purple-bg", border: "border-badge-purple-border", text: "text-badge-purple-text" },
  { bg: "bg-badge-orange-bg", border: "border-badge-orange-border", text: "text-badge-orange-text" },
  { bg: "bg-badge-blue-bg", border: "border-badge-blue-border", text: "text-badge-blue-text" },
] as const;

export function binIdBadgeClasses(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  const { bg, border, text } = BADGE_PALETTE[hash % BADGE_PALETTE.length];
  return `${bg} ${border} ${text}`;
}
