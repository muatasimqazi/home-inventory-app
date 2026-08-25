import "server-only";
import { generateImage, type ImageModel } from "ai";

// From-scratch location cover photos ("generate a picture of my Pantry")
// — a genuinely different job from lib/vision/generate-studio-photo.ts's
// image *edit* (existing item photo in, restyled background out): no
// input image at all, just a text prompt describing the room. Same two
// Gateway-routed models as that module though (one billing/observability
// system, no new provider account), and the same primary/fallback
// reliability posture — generateImage() happily does plain text-to-image
// with these same model ids when no `images` are passed in the prompt.
const PRIMARY_MODEL: ImageModel = "google/gemini-3.1-flash-image-preview";
const FALLBACK_MODEL: ImageModel = "openai/gpt-image-2";

// Same reasoning as generate-studio-photo's own CALL_TIMEOUT_MS — image
// generation genuinely takes longer than a structured-text call, and this
// is one call, not several run in parallel, so it gets the full budget.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

// Locations display their cover photo in a wide h-48 w-full banner (see
// locations/[id]/page.tsx), not the square/portrait crop items use — 16:9
// is the closest standard ratio these models accept to that shape.
const ASPECT_RATIO = "16:9";

function buildPrompt(roomType: string, detail: string | null): string {
  const subject = detail ? `${roomType}, ${detail}` : roomType;
  // "no people, no text/logos/watermarks" for the same reason
  // generate-studio-photo avoids adding anything not actually in the
  // original item photo — this is a stand-in banner image for a household
  // storage location, not a stock photo that needs a human or brand in it.
  return `A professional, photorealistic interior/real-estate-photography style photo of a clean, well-organized, tidy ${subject}. Bright, natural lighting, inviting and realistic — not a rendering or illustration. No people, no visible text, logos, or watermarks.`;
}

async function runGeneration(model: ImageModel, prompt: string): Promise<string> {
  const { images } = await generateImage({
    model,
    prompt,
    aspectRatio: ASPECT_RATIO,
    maxRetries: CALL_MAX_RETRIES,
    abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (images.length === 0) throw new Error("Model returned no image.");
  return images[0].base64;
}

/**
 * Generates one photorealistic banner photo for a storage location (e.g.
 * "Kitchen", "Pantry", "Wardrobe") from its type and an optional freeform
 * detail string. Primary model tried first; on any failure, falls back to
 * a different provider once before giving up — same shape as
 * generateStudioPhoto/detectItems elsewhere in lib/vision.
 *
 * Returns the generated image as a base64 string (no data: prefix) — the
 * caller (the API route) uploads it to Storage, this function has no
 * knowledge of Supabase at all.
 */
export async function generateLocationPhoto(roomType: string, detail: string | null): Promise<string> {
  const prompt = buildPrompt(roomType, detail);
  try {
    return await runGeneration(PRIMARY_MODEL, prompt);
  } catch (primaryError) {
    console.error(`Primary image model failed (location photo, roomType=${roomType}), falling back to`, FALLBACK_MODEL, primaryError);
    try {
      return await runGeneration(FALLBACK_MODEL, prompt);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (location photo, roomType=${roomType}):`, fallbackError);
      throw fallbackError;
    }
  }
}
