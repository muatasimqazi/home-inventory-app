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
// the PRD's own 30-60s target is per *result*, not the whole batch. The
// API route calls this once per requested style **sequentially**, not
// via Promise.all — concurrent calls referencing the same input image
// were the suspected cause of a real, reported bug (the first style in a
// batch came out correctly transformed, later ones came back as
// near-copies of the original), consistent with an image-preview/
// multimodal provider's request-level caching or dedup logic keying off
// the shared input image across simultaneous requests. Sequential calls
// side-step that entirely, at the cost of a longer total wait for a
// multi-style batch — an acceptable trade for actually-correct output.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

// Prompt shape, per style: [1] the transformation itself, stated first
// and as the primary instruction — [2] an explicit "actually do this"
// reinforcement — [3] preservation constraints, stated last as a
// modifier on top of the transformation rather than the leading idea.
//
// This ordering is deliberate, not stylistic: leading with heavy
// "preserve/don't alter" language (this file's original shape) measurably
// made the model under-transform — real, reported behavior was the
// *second and later* styles in one multi-style batch coming back as
// near-copies of the original photo, as if "don't change anything" won
// out over the actual style instruction the model was also given.
// Instruction-following models weight an earlier instruction more
// heavily than a later one; putting the transformation first and the
// preservation constraint after fixes exactly that failure mode without
// weakening the preservation guarantee itself (the PRD's #1 Risk is still
// fully addressed, just stated second).
const TRANSFORM_REINFORCEMENT =
  "Actually apply this transformation fully — the output must look meaningfully different from the input photo (new background/composition), not a near-identical copy of it with only a trivial edit.";

const PRESERVE_INSTRUCTION =
  "While transforming it, keep the item's exact color, texture, pattern, material, silhouette, proportions, and any visible labels, logos, brand marks, or text exactly as shown in the original photo. Do not add, remove, or alter any design details, damage, stains, or embellishments — it must still be recognizable as the exact same physical item, not a reimagined version of it.";

const STYLE_PROMPTS: Record<ItemStudioPhotoStyle, string> = {
  white_background: `Isolate the item on a pure white, seamless ecommerce background. Even, soft studio lighting, no harsh shadows, no other objects in frame. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
  transparent_background: `Isolate the item with a fully transparent background (alpha channel, PNG) — no background color or texture at all, just the item cleanly cut out. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
  studio_shadow: `Place the item on a pure white background with a soft, realistic drop shadow beneath it, as if professionally photographed on a studio product table. Even, soft lighting. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
  ghost_mannequin: `Render the item as a realistic "ghost mannequin" (invisible mannequin) ecommerce product photo — the garment appears filled out with natural human-body volume, shape, and drape (shoulders, sleeves, collar, torso) exactly as it would look worn, but with absolutely no mannequin, model, body, or neck-hole void visible anywhere — a standard apparel-photography technique. Pure white background, even studio lighting. Only apply this treatment when the item is genuinely a body-worn garment (a top, jacket, dress, or similar) where it makes physical sense — if the item is a flat accessory, a shoe, or something that isn't worn draped over a body (a belt, a bag, jewelry), instead render it as a clean, well-lit product shot on a pure white background, exactly like the white_background style, rather than forcing an invisible-mannequin effect that wouldn't make sense for it. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
  boutique_flat_lay: `Arrange the item neatly as a boutique flat lay on a clean, neutral flat surface (light wood or linen), photographed from directly above, catalog style. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
  neutral_lifestyle: `Place the item in a simple, tasteful, neutral lifestyle setting appropriate to it (e.g. draped over a chair, hung on a wall hook, or laid flat on a neutral surface) with soft natural light. Keep the setting minimal and uncluttered — it should never distract from the item itself. ${TRANSFORM_REINFORCEMENT} ${PRESERVE_INSTRUCTION}`,
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
