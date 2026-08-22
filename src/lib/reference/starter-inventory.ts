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
 * Case-insensitive exact match first, then substring containment either
 * direction — the one matching policy this module (and the Ask tool's own
 * household-location matcher, which needs the same policy against
 * different data) builds every "best-effort name match" on, so a future
 * change to the policy itself (punctuation normalization, word-boundary
 * matching, whatever) only needs to land here once. Returns every item
 * satisfying the best tier that matched at all (every exact match, or if
 * none, every containment match) — never a mix of tiers. Callers decide
 * how to handle more than one: REFERENCE_LOCATIONS' fixed 22 names don't
 * collide this way in practice, so matchReferenceLocation below just takes
 * the first; a caller matching against arbitrary user-named data (real
 * household Locations) should treat more than one candidate as genuinely
 * ambiguous rather than silently picking one.
 */
export function matchByName<T>(items: readonly T[], getName: (item: T) => string, query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const exact = items.filter((it) => getName(it).toLowerCase() === needle);
  if (exact.length > 0) return exact;
  return items.filter((it) => {
    const name = getName(it).toLowerCase();
    return needle.includes(name) || name.includes(needle);
  });
}

/**
 * Best-effort match from a household's own (free-text, user-chosen)
 * Location name to one of REFERENCE_LOCATIONS, so item-name suggestions
 * can be scoped to "what's typically in a Garage" for a household location
 * actually named "Garage" (so "Kids Room" matches "Children" only if a
 * caller phrases the reference name to contain it; today's list doesn't
 * overlap that way, so this mostly resolves to the exact-match case, with
 * substring as a harmless, conservative fallback for near-misses like "The
 * Garage" or "Main Garage"). Returns null (no suggestions, not a wrong
 * guess) when nothing reasonably matches. The 22-entry reference list
 * doesn't produce real multi-match ambiguity in practice, so this takes
 * the first match rather than surfacing the list matchByName returns.
 */
export function matchReferenceLocation(householdLocationName: string): string | null {
  return matchByName(REFERENCE_LOCATIONS, (loc) => loc, householdLocationName)[0] ?? null;
}

/** Shared by both suggest* functions below: case-insensitive substring match on name, shortest-name-first so closer matches (e.g. "Oven" before "Oven and Range" for query "oven") lead the list. Under 2 characters is treated as "no query yet" (matches the Add Item typeahead's own threshold — a 1-character query against a 2,662-row catalog is mostly noise). */
function rankByName(items: ReferenceInventoryItem[], query: string, limit: number): ReferenceInventoryItem[] {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  return items
    .filter((it) => it.name.toLowerCase().includes(needle))
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}

/** Up to `limit` items in `referenceLocation` whose name contains `query` (case-insensitive). Used by the Add Item form's location-scoped name typeahead. */
export function suggestReferenceItems(items: ReferenceInventoryItem[], referenceLocation: string, query: string, limit = 6): ReferenceInventoryItem[] {
  return rankByName(
    items.filter((it) => it.location === referenceLocation),
    query,
    limit
  );
}

/** Same matching/ranking as suggestReferenceItems, but across the whole catalog rather than one location — Search's "Common items" results aren't scoped to a single household location the way the Add Item form's typeahead is. */
export function suggestReferenceItemsAcrossCatalog(items: ReferenceInventoryItem[], query: string, limit = 24): ReferenceInventoryItem[] {
  return rankByName(items, query, limit);
}
