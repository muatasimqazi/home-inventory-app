import type { Category } from "@/lib/types";
import referenceLocations from "./up-home-inventory-locations.json";

/**
 * Reference dataset for onboarding/typeahead, sourced from United
 * Policyholders' "UP-PRINT-LIST-HOME-INVENTORY" spreadsheet (their public
 * home-inventory worksheet, one tab per storage area). This is NOT
 * household data — no household_id, no DB row, nothing per-user. It's a
 * static, bundled reference list every household draws suggestions from,
 * same idea as the CATEGORIES const in lib/types.ts.
 *
 * Extraction (one-time, from the .xlsx the user provided): each of the
 * workbook's 22 real tabs (the 23rd, "TOTAL", is an empty print-summary
 * template) became one REFERENCE_LOCATIONS entry; each tab's ~40-400 rows
 * (columns: Description of Property / Type / Room) became the items list.
 * The tab NAME was used as the canonical location, not the row-level
 * "Room" column — spot-checking showed Room drifting within a tab (the
 * "Music" tab's rows all say Room="Library", "Car"'s all say Room="Garage",
 * "Travel" and "Hobby" both say Room="Bonus") in a way that reads as
 * leftover template artifacts, not real per-item location data, while the
 * tab name itself was consistent. 2,706 raw rows deduped to 2,662 unique
 * (location, name) pairs (44 exact dupes within the same tab) after
 * trimming, whitespace-collapsing, and dropping the sheet's own
 * "example: item 1" placeholder + copyright-notice rows.
 *
 * The spreadsheet's own "Type" column (130 distinct raw values — a loose,
 * per-tab-invented taxonomy, e.g. "Ceramic" vs "Ceramics", "Cleaning" vs
 * "Cleaning  Supplies") does NOT become new app categories. This app's item
 * Category is the closed CATEGORIES enum (lib/types.ts) that
 * CATEGORY_EXTRA_FIELDS (lib/category.ts) is keyed on — adding 130 loose
 * strings there would be a breaking schema change to that lookup, not a
 * typeahead feature. Instead, every reference item carries a `category`
 * that's the CATEGORIES enum value best matching its original Type (a
 * hand-built ~130-entry mapping, defaulting to "Miscellaneous" for
 * anything with no clear fit) — so picking a suggested item can also
 * pre-fill the existing category picker with a reasonable guess, without
 * the enum itself changing.
 *
 * Split into two JSON files (not one): up-home-inventory-locations.json is
 * a few hundred bytes (22 strings) and is imported eagerly below — cheap
 * enough for any route. up-home-inventory-items.json is ~220KB (2,662
 * rows) and is loaded only via loadReferenceItems()'s dynamic import,
 * cached in module scope after the first call, so it never adds to the
 * eagerly-loaded bundle of a route that hasn't asked for it yet.
 */
export interface ReferenceInventoryItem {
  location: string;
  name: string;
  category: Category;
}

/** The 22 real tab names, alphabetical. */
export const REFERENCE_LOCATIONS: string[] = referenceLocations;

let cachedItems: ReferenceInventoryItem[] | null = null;

export async function loadReferenceItems(): Promise<ReferenceInventoryItem[]> {
  if (cachedItems) return cachedItems;
  const mod = await import("./up-home-inventory-items.json");
  cachedItems = mod.default as ReferenceInventoryItem[];
  return cachedItems;
}

/**
 * Best-effort match from a household's own (free-text, user-chosen)
 * Location name to one of REFERENCE_LOCATIONS, so item-name suggestions
 * can be scoped to "what's typically in a Garage" for a household location
 * actually named "Garage" — exact case-insensitive match first, then
 * substring containment either direction (so "Kids Room" matches
 * "Children" only if a caller phrases the reference name to contain it;
 * today's list doesn't overlap that way, so this mostly resolves to the
 * exact-match case, with substring as a harmless, conservative fallback
 * for near-misses like "The Garage" or "Main Garage"). Returns null
 * (no suggestions, not a wrong guess) when nothing reasonably matches.
 */
export function matchReferenceLocation(householdLocationName: string): string | null {
  const needle = householdLocationName.trim().toLowerCase();
  if (!needle) return null;
  const exact = REFERENCE_LOCATIONS.find((loc) => loc.toLowerCase() === needle);
  if (exact) return exact;
  const contains = REFERENCE_LOCATIONS.find((loc) => needle.includes(loc.toLowerCase()) || loc.toLowerCase().includes(needle));
  return contains ?? null;
}

/** Up to `limit` items in `referenceLocation` whose name contains `query` (case-insensitive), shortest-name-first so closer matches (e.g. "Oven" before "Oven and Range" for query "oven") lead the list. */
export function suggestReferenceItems(items: ReferenceInventoryItem[], referenceLocation: string, query: string, limit = 6): ReferenceInventoryItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return items
    .filter((it) => it.location === referenceLocation && it.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}
