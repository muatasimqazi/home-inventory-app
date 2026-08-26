import type { ItemStudioPhotoStyle } from "@/lib/types";

// Single source of truth for the set of Wardrobe Photo Studio styles —
// shared by the style picker (wardrobe-studio-sheet.tsx), the item
// detail page's generation history (item-studio-photos-section.tsx),
// and the generation route's own validation, so a new style only ever
// needs adding in one place instead of staying in sync across four.
export const WARDROBE_STYLES: ItemStudioPhotoStyle[] = [
  "ghost_mannequin",
  "ghost_mannequin_profile",
  "white_background",
  "transparent_background",
  "studio_shadow",
  "boutique_flat_lay",
  "neutral_lifestyle",
];

// Styles that only make sense for an actual garment — a "ghost mannequin"
// (invisible body filling the item out) or a "flat lay" (garment arranged
// flat the way clothing gets folded/laid out) both presuppose the item is
// worn or folded fabric. The generation prompt itself already has a
// fallback for a non-garment item picked *within* the wardrobe flow (a
// belt, a bag) — see STYLE_PROMPTS in lib/vision/generate-studio-photo.ts
// — but that's a safety net for edge cases inside Clothing, not a reason
// to offer these as real choices on, say, a lamp or a coffee maker once
// the picker was opened up to every item (wardrobe-studio-sheet.tsx).
const GARMENT_ONLY_STYLES = new Set<ItemStudioPhotoStyle>(["ghost_mannequin", "ghost_mannequin_profile", "boutique_flat_lay"]);

/** The styles worth offering for an item in the given category — every style for Clothing, garment-only ones dropped for anything else. */
export function stylesForCategory(category: string): ItemStudioPhotoStyle[] {
  return category === "Clothing" ? WARDROBE_STYLES : WARDROBE_STYLES.filter((style) => !GARMENT_ONLY_STYLES.has(style));
}

export const WARDROBE_STYLE_LABEL: Record<ItemStudioPhotoStyle, string> = {
  ghost_mannequin: "Ghost Mannequin",
  ghost_mannequin_profile: "Ghost Mannequin — Profile",
  white_background: "White Background",
  transparent_background: "Transparent",
  studio_shadow: "Studio Shadow",
  boutique_flat_lay: "Boutique Flat Lay",
  neutral_lifestyle: "Neutral Lifestyle",
};
