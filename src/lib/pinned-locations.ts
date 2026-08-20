import type { IconName } from "@/components/icon";
import type { PinnedLocationCategory } from "@/lib/types";

/** Home Map (PRD §29) category metadata — one small lookup, shared between
 * the list page, the create/edit sheet, and any future `src/lib/ask/tools.ts`
 * lookup tool, so the label/icon per category lives in exactly one place. */
export const PINNED_LOCATION_CATEGORIES: PinnedLocationCategory[] = [
  "water_shutoff",
  "electrical_panel",
  "gas_shutoff",
  "hvac",
  "network",
  "wall_photo",
  "other",
];

export const PINNED_LOCATION_CATEGORY_LABELS: Record<PinnedLocationCategory, string> = {
  water_shutoff: "Water Shutoff",
  electrical_panel: "Electrical Panel",
  gas_shutoff: "Gas Shutoff",
  hvac: "HVAC",
  network: "Network Equipment",
  wall_photo: "Wall Photo (Before Drywall)",
  other: "Other",
};

export const PINNED_LOCATION_CATEGORY_ICONS: Record<PinnedLocationCategory, IconName> = {
  water_shutoff: "droplet",
  electrical_panel: "zap",
  gas_shutoff: "flame",
  hvac: "wind",
  network: "router",
  wall_photo: "hammer",
  other: "pin",
};
