import "server-only";
import { generateImage, type ImageModel } from "ai";
import type { ItemStudioPhotoAspectRatio, ItemStudioPhotoStyle } from "@/lib/types";

// Server-only AI studio-photo generation (docs/Wardrobe Inventory.md) —
// the app's first real image-*generation* capability, sibling to
// lib/vision/detect.ts's vision-*analysis* pipeline but a genuinely
// different task: an image-edit model in, an edited image out, not
// structured text. Same Gateway-routed primary/fallback reliability
// posture as every other AI capability here (one billing/observability
// system, no new provider account) — just generateImage() instead of
// generateText().
//
// Both models are image-EDIT models (take an input image + instructions,
// return a modified image), not from-scratch generators — the right tool
// for "keep this exact garment, change only its background," which is
// the whole point per the PRD's own #1 Risk ("AI may alter the item and
// misrepresent it") and Quality Requirements (preserve color/texture/
// silhouette/labels, never add fake damage/logos/embellishments).
const PRIMARY_MODEL: ImageModel = "google/gemini-3.1-flash-image-preview";
const FALLBACK_MODEL: ImageModel = "openai/gpt-image-2";

// Image generation genuinely takes longer than a structured-text call —
// the PRD's own 30-60s target is per *result*, and this file is one
// model call per style, run in parallel by the caller (the API route),
// not chained — so each individual call gets real headroom rather than
// splitting a shared budget.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

// Every style's prompt leads with the same non-negotiable preservation
// instruction before its own specific background/composition — the
// preservation half is the part that actually matters for trust (a
// resold item has to still look like the item), the background/
// composition half is just styling on top of that.
const PRESERVE_INSTRUCTION =
  "Keep the item's exact color, texture, pattern, material, silhouette, proportions, and any visible labels, logos, brand marks, or text exactly as shown in the original photo. Do not add, remove, or alter any design details, damage, stains, or embellishments — this must still be recognizable as the exact same physical item, not a reimagined version of it.";

const STYLE_PROMPTS: Record<ItemStudioPhotoStyle, string> = {
  white_background: `${PRESERVE_INSTRUCTION} Isolate the item on a pure white, seamless ecommerce background. Even, soft studio lighting, no harsh shadows, no other objects in frame.`,
  transparent_background: `${PRESERVE_INSTRUCTION} Isolate the item with a fully transparent background (alpha channel, PNG) — no background color or texture at all, just the item cleanly cut out.`,
  studio_shadow: `${PRESERVE_INSTRUCTION} Place the item on a pure white background with a soft, realistic drop shadow beneath it, as if professionally photographed on a studio product table. Even, soft lighting.`,
  boutique_flat_lay: `${PRESERVE_INSTRUCTION} Arrange the item neatly as a boutique flat lay on a clean, neutral flat surface (light wood or linen), photographed from directly above, catalog style.`,
  neutral_lifestyle: `${PRESERVE_INSTRUCTION} Place the item in a simple, tasteful, neutral lifestyle setting appropriate to it (e.g. draped over a chair, hung on a wall hook, or laid flat on a neutral surface) with soft natural light. Keep the setting minimal and uncluttered — it should never distract from the item itself.`,
};

function dataUrlToBuffer(dataUrl: string): Buffer {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1);
  return Buffer.from(base64, "base64");
}

async function runGeneration(model: ImageModel, photo: Buffer, style: ItemStudioPhotoStyle, aspectRatio: ItemStudioPhotoAspectRatio): Promise<string> {
  // generateImage has no `timeout` option (unlike generateText elsewhere
  // in this codebase) — AbortSignal.timeout() is the SDK's own documented
  // way to bound one, same CALL_TIMEOUT_MS budget either way.
  const { images } = await generateImage({
    model,
    prompt: { text: STYLE_PROMPTS[style], images: [photo] },
    aspectRatio,
    maxRetries: CALL_MAX_RETRIES,
    abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (images.length === 0) throw new Error("Model returned no image.");
  return images[0].base64;
}

/**
 * Generates one ecommerce-style studio photo of a wardrobe/inventory item
 * in the given style, from its original photo (a data URL). Primary
 * model tried first; on any failure, falls back to a different provider
 * once before giving up — same shape as detectItems/detectApplianceLabel
 * in lib/vision/detect.ts, just generateImage instead of generateText.
 *
 * Returns the generated image as a base64 string (no data: prefix) —
 * the caller (the API route) uploads it to Storage, this function has no
 * knowledge of Supabase at all.
 */
export async function generateStudioPhoto(photoDataUrl: string, style: ItemStudioPhotoStyle, aspectRatio: ItemStudioPhotoAspectRatio): Promise<string> {
  const photo = dataUrlToBuffer(photoDataUrl);
  try {
    return await runGeneration(PRIMARY_MODEL, photo, style, aspectRatio);
  } catch (primaryError) {
    console.error(`Primary image model failed (studio photo, style=${style}), falling back to`, FALLBACK_MODEL, primaryError);
    try {
      return await runGeneration(FALLBACK_MODEL, photo, style, aspectRatio);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (studio photo, style=${style}):`, fallbackError);
      throw fallbackError;
    }
  }
}
