import { getSupabaseBrowserClient } from "./supabase/client";

/** The "item-photos" bucket is public (shared across items/locations/containers), so this is a pure client-side URL construction — no signed URL, no network round trip, safe to call on every render of every card. */
export function coverPhotoUrl(path: string): string {
  return getSupabaseBrowserClient().storage.from("item-photos").getPublicUrl(path).data.publicUrl;
}
