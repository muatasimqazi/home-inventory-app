import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { matchReferenceLocation } from "@/lib/reference/starter-inventory";

const STOCK_LOCATION_PHOTOS_BUCKET = "stock-photos";

/** Storage object key for a REFERENCE_LOCATIONS name — must match how scripts/seed-stock-location-photos.ts names the file it uploads. */
export function stockLocationPhotoSlug(referenceLocationName: string): string {
  return `${referenceLocationName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.png`;
}

// The REFERENCE_LOCATIONS names that actually have a real uploaded stock
// photo in the "stock-photos" bucket — populated by hand from
// scripts/seed-stock-location-photos.ts's own console output after a real
// run, not assumed from REFERENCE_LOCATIONS itself, since AI generation
// isn't 100% reliable per-name and a missing object would otherwise render
// as a silently broken <img> (PhotoThumb has no per-photo existence check,
// same as any other cover photo). Re-run the script and update this list
// if REFERENCE_LOCATIONS ever changes or a name needs regenerating.
export const STOCK_LOCATION_PHOTO_NAMES: string[] = [
  "Art Small Tools & Supplies",
  "Art Studio & Large Tools",
  "Artist Medium",
  "Bathroom",
  "Bedroom",
  "Books",
  "Car",
  "Children",
  "Den, School",
  "Dining Room",
  "Documents",
  "Emergency", // regenerated on retry — the first prod run timed out on this one specifically
  "Family, Living",
  "Garage",
  "Hobby",
  "Kitchen",
  "Laundry, Cleaning",
  "Music",
  "Outdoor",
  "Pets",
  "Recreation, Sports, Exercise",
  "Travel",
];

/**
 * A stock cover photo URL for a household's own (free-text) Location name,
 * or null if nothing reasonably matches or that match never got a real
 * stock photo. This is the "auto-chosen" tier between a Location's own
 * coverPhotoPath (always wins if set) and the plain emoji fallback
 * (PhotoThumb's own last resort) — purely a display-time computation,
 * never written to a Location row, so it costs nothing to keep showing a
 * closer/updated stock set later and never needs a backfill migration.
 * Real photos (AI-regenerated or uploaded) always take over from here the
 * moment a Location gets its own coverPhotoPath.
 */
export function stockLocationPhotoUrl(locationName: string): string | null {
  const match = matchReferenceLocation(locationName);
  if (!match || !STOCK_LOCATION_PHOTO_NAMES.includes(match)) return null;
  return getSupabaseBrowserClient().storage.from(STOCK_LOCATION_PHOTOS_BUCKET).getPublicUrl(stockLocationPhotoSlug(match)).data.publicUrl;
}
