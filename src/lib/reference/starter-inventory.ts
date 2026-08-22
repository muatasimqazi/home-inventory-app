import type { Category } from "@/lib/types";
import referenceLocations from "./starter-inventory-locations.json";

/**
 * Reference dataset for onboarding/typeahead — a broad, generic catalog of
 * common household storage areas and the items typically found in each.
 * This is NOT household data — no household_id, no DB row, nothing
 * per-user. It's a static, bundled reference list every household draws
 * suggestions from, same idea as the CATEGORIES const in lib/types.ts.
 *
 * Source shape (one-time extraction): organized as ~22 storage-area
 * buckets, each with ~40-400 named items plus a loose free-text grouping
 * per item. 2,706 raw entries deduped to 2,662 unique (location, name)
 * pairs (44 exact dupes within the same bucket) after trimming,
 * whitespace-collapsing, and dropping placeholder/boilerplate rows.
 *
 * The source's own free-text item grouping (130 distinct raw values — a
 * loose, per-bucket-invented taxonomy, e.g. "Ceramic" vs "Ceramics",
 * "Cleaning" vs "Cleaning  Supplies") does NOT become new app categories.
 * This app's item Category is the closed CATEGORIES enum (lib/types.ts)
 * that CATEGORY_EXTRA_FIELDS (lib/category.ts) is keyed on — adding 130
 * loose strings there would be a breaking schema change to that lookup,
 * not a typeahead feature. Instead, every reference item carries a
 * `category` that's the CATEGORIES enum value best matching its original
 * grouping (a hand-built ~130-entry mapping, defaulting to "Miscellaneous"
 * for anything with no clear fit) — so picking a suggested item can also
 * pre-fill the existing category picker with a reasonable guess, without
 * the enum itself changing.
 *
 * Split into two JSON files (not one): starter-inventory-locations.json is
 * a few hundred bytes (22 strings) and is imported eagerly below — cheap
 * enough for any route. starter-inventory-items.json is ~220KB (2,662
 * rows) and is loaded only via loadReferenceItems()'s dynamic import,
 * cached in module scope after the first call, so it never adds to the
 * eagerly-loaded bundle of a route that hasn't asked for it yet.
 */
export interface ReferenceInventoryItem {
  location: string;
  name: string;
  category: Category;
}

/** The 22 storage-area names, alphabetical. */
export const REFERENCE_LOCATIONS: string[] = referenceLocations;

let cachedItems: ReferenceInventoryItem[] | null = null;

export async function loadReferenceItems(): Promise<ReferenceInventoryItem[]> {
  if (cachedItems) return cachedItems;
  const mod = await import("./starter-inventory-items.json");
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
