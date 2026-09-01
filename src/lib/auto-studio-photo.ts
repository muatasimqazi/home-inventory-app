"use client";

import type { ItemStudioPhoto, ItemStudioPhotoStyle } from "@/lib/types";

/**
 * The single default studio style used for automatic, one-photo generation
 * — run right after Save by every AI-detection capture flow (general Item,
 * Appliance, Document, Wardrobe review). Not to be confused with
 * WardrobeStudioSheet's own multi-style picker (still available from any
 * item's "Create Studio Photo" button for anyone who wants more/different
 * styles later) — this always requests exactly one. Clothing gets the same
 * first style WardrobeStudioSheet's own DEFAULT_CLOTHING_STYLES starts
 * with; every other category gets the same first general default.
 */
export function defaultStudioStyle(category: string): ItemStudioPhotoStyle {
  return category === "Clothing" ? "ghost_mannequin" : "white_background";
}

// createItem()/createItemsBatch() (lib/store.ts) return synchronously off
// optimistic local state — the actual Supabase insert is a fire-and-forget
// persistOrRevert() the caller never awaits. Called immediately afterward
// (no human-paced delay in between, unlike WardrobeStudioSheet's own
// picker, which only ever runs generation once a person has looked at the
// sheet and tapped Generate — by then the insert has long since landed),
// this route's own server-side item lookup can race that insert and 404
// even though the item is about to exist. Retried a few times on a 404
// specifically — never on any other error — rather than making createItem
// itself awaitable, which every other call site across the app would then
// need to account for.
const NOT_FOUND_RETRY_DELAYS_MS = [500, 1000, 1500];

/**
 * Requests exactly one studio photo for a just-created item. Throws on
 * failure (including exhausting the 404 retries above) — every call site
 * catches this and falls back to keeping the item's existing cover photo
 * rather than blocking the save itself on a generation failure.
 */
export async function generateAutoStudioPhoto(params: {
  householdId: string;
  itemId: string;
  originalPhotoPath: string;
  category: string;
}): Promise<ItemStudioPhoto> {
  const style = defaultStudioStyle(params.category);

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("/api/v1/vision/generate-studio-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        householdId: params.householdId,
        itemId: params.itemId,
        originalPhotoPath: params.originalPhotoPath,
        styles: [style],
        aspectRatio: "1:1",
      }),
    });

    if (res.status === 404 && attempt < NOT_FOUND_RETRY_DELAYS_MS.length) {
      await new Promise((resolve) => setTimeout(resolve, NOT_FOUND_RETRY_DELAYS_MS[attempt]));
      continue;
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Studio photo generation failed (${res.status}).`);
    const [result] = (data?.results ?? []) as ItemStudioPhoto[];
    if (!result) throw new Error("Studio photo generation returned no result.");
    return result;
  }
}
