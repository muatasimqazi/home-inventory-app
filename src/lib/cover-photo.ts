import { getSupabaseBrowserClient } from "./supabase/client";

/**
 * The "item-photos" bucket is public (shared across items/locations/containers), so this is a pure client-side URL construction — no signed URL, no network round trip, safe to call on every render of every card.
 *
 * `path` may also already be a resolved http(s) URL — stockLocationPhotoUrl (lib/stock-location-photos.ts) resolves against a different bucket ("stock-photos"), so it hands back a full URL rather than a bare path; passed straight through here unchanged so every caller (PhotoThumb included) can keep treating "the thing to display" as one opaque string regardless of which bucket it actually came from.
 */
export function coverPhotoUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path;
  return getSupabaseBrowserClient().storage.from("item-photos").getPublicUrl(path).data.publicUrl;
}
