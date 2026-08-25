import type { ItemStudioPhotoStyle } from "@/lib/types";

// Single source of truth for the set of Wardrobe Photo Studio styles —
// shared by the style picker (wardrobe-studio-sheet.tsx), the item
// detail page's generation history (item-studio-photos-section.tsx),
// and the generation route's own validation, so a new style only ever
// needs adding in one place instead of staying in sync across four.
export const WARDROBE_STYLES: ItemStudioPhotoStyle[] = [
  "ghost_mannequin",
  "white_background",
  "transparent_background",
  "studio_shadow",
  "boutique_flat_lay",
  "neutral_lifestyle",
];

export const WARDROBE_STYLE_LABEL: Record<ItemStudioPhotoStyle, string> = {
  ghost_mannequin: "Ghost Mannequin",
  white_background: "White Background",
  transparent_background: "Transparent",
  studio_shadow: "Studio Shadow",
  boutique_flat_lay: "Boutique Flat Lay",
  neutral_lifestyle: "Neutral Lifestyle",
};
