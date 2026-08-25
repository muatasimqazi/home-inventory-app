import { NextResponse } from "next/server";
import { requireHouseholdMember } from "@/lib/authorize";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { generateStudioPhoto } from "@/lib/vision/generate-studio-photo";
import { itemStudioPhotoToInsertRow } from "@/lib/supabase/mappers";
import { newId } from "@/lib/id";
import type { ItemStudioPhoto, ItemStudioPhotoAspectRatio, ItemStudioPhotoStyle } from "@/lib/types";

export const runtime = "nodejs";

const VALID_STYLES: ItemStudioPhotoStyle[] = ["white_background", "transparent_background", "studio_shadow", "boutique_flat_lay", "neutral_lifestyle"];
const VALID_ASPECT_RATIOS: ItemStudioPhotoAspectRatio[] = ["1:1", "4:5"];
// A real cap on one batch — the client's own style picker already caps
// selection at 3 (docs/Wardrobe Inventory.md's "generate at least 3
// variants" as a sensible default, not "generate all 5 every time"), but
// the limit lives here too so the route itself can't be made to kick off
// an unbounded number of image-generation calls.
const MAX_STYLES = 3;

/**
 * Wardrobe Photo Studio's actual generation step (docs/Wardrobe
 * Inventory.md). Runs entirely under the caller's own session (
 * getSupabaseServerClient(), not the admin/service-role client) — RLS on
 * item_studio_photos and the item-photos Storage bucket is already
 * exactly the household-membership grant this route needs, same
 * "real auth, no elevated privilege" posture as
 * /api/v1/finance/detect-recurring.
 *
 * Synchronous by design (see the migration's own comment) — one
 * generateImage call per requested style, run in parallel, each caught
 * independently so one style failing doesn't take the others down with
 * it. Every attempt gets a row (complete or failed) — nothing is ever
 * silently dropped, satisfying "clear failure states" without a real job
 * queue.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId, itemId, originalPhotoPath, styles, aspectRatio } = (body ?? {}) as {
    householdId?: unknown;
    itemId?: unknown;
    originalPhotoPath?: unknown;
    styles?: unknown;
    aspectRatio?: unknown;
  };
  if (typeof householdId !== "string" || !householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  if (typeof itemId !== "string" || !itemId) return NextResponse.json({ error: "`itemId` is required." }, { status: 400 });
  if (typeof originalPhotoPath !== "string" || !originalPhotoPath) return NextResponse.json({ error: "`originalPhotoPath` is required." }, { status: 400 });
  if (!Array.isArray(styles) || styles.length === 0 || styles.length > MAX_STYLES || !styles.every((s) => VALID_STYLES.includes(s as ItemStudioPhotoStyle))) {
    return NextResponse.json({ error: `\`styles\` must be 1-${MAX_STYLES} of: ${VALID_STYLES.join(", ")}.` }, { status: 400 });
  }
  if (typeof aspectRatio !== "string" || !VALID_ASPECT_RATIOS.includes(aspectRatio as ItemStudioPhotoAspectRatio)) {
    return NextResponse.json({ error: "`aspectRatio` must be one of: 1:1, 4:5." }, { status: 400 });
  }

  const auth = await requireHouseholdMember(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const supabase = await getSupabaseServerClient();

  const { data: itemRow } = await supabase.from("items").select("id, household_id").eq("id", itemId).maybeSingle();
  if (!itemRow || itemRow.household_id !== householdId) {
    return NextResponse.json({ error: "Item not found." }, { status: 404 });
  }

  // The original photo already lives in the public "item-photos" bucket
  // (uploaded at item-creation/cover-photo time, same as any other cover
  // photo) — fetched here server-side rather than making the client
  // resend the image bytes it already uploaded once.
  const publicUrl = supabase.storage.from("item-photos").getPublicUrl(originalPhotoPath).data.publicUrl;
  let photoDataUrl: string;
  try {
    const imgRes = await fetch(publicUrl);
    if (!imgRes.ok) throw new Error(`fetch failed: ${imgRes.status}`);
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    photoDataUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch (error) {
    console.error("generate-studio-photo: couldn't fetch the original photo:", error);
    return NextResponse.json({ error: "Couldn't read the original photo. Please try again.", retryable: true }, { status: 502 });
  }

  const batchId = newId();
  const requestedAt = new Date().toISOString();

  const results = await Promise.all(
    (styles as ItemStudioPhotoStyle[]).map(async (style): Promise<ItemStudioPhoto> => {
      const base = {
        id: newId(),
        householdId,
        itemId,
        batchId,
        originalPhotoPath,
        style,
        aspectRatio: aspectRatio as ItemStudioPhotoAspectRatio,
        createdByUserId: auth.userId,
        createdAt: requestedAt,
      };
      try {
        const generatedBase64 = await generateStudioPhoto(photoDataUrl, style, aspectRatio as ItemStudioPhotoAspectRatio);
        const path = `${householdId}/${newId()}`;
        // PNG unconditionally — the transparent_background style needs
        // real alpha support, and PNG is a fine format for every other
        // style too (a few KB bigger than JPEG, not worth a per-style
        // content-type branch for this pass).
        const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, Buffer.from(generatedBase64, "base64"), { contentType: "image/png" });
        if (uploadError) throw new Error(uploadError.message);
        return { ...base, status: "complete", generatedPhotoPath: path, errorMessage: null, completedAt: new Date().toISOString() };
      } catch (error) {
        console.error(`generate-studio-photo: generation failed for style "${style}":`, error);
        const message = error instanceof Error ? error.message : "Generation failed.";
        return { ...base, status: "failed", generatedPhotoPath: null, errorMessage: message, completedAt: new Date().toISOString() };
      }
    })
  );

  const { error: insertError } = await supabase.from("item_studio_photos").insert(results.map(itemStudioPhotoToInsertRow));
  if (insertError) {
    console.error("generate-studio-photo: couldn't save results:", insertError);
    return NextResponse.json({ error: "Generated, but couldn't save the results. Please try again.", retryable: true }, { status: 502 });
  }

  return NextResponse.json({ results });
}
