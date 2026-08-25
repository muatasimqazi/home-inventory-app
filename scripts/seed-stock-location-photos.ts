/**
 * One-time (re-runnable) seed: generates one AI photo per REFERENCE_LOCATIONS
 * name (lib/reference/starter-inventory.ts) and uploads it to the
 * "stock-photos" Storage bucket (0045_stock_location_photos.sql), so
 * common Locations get a real photo by default instead of the plain emoji
 * — see lib/stock-location-photos.ts, the display-time consumer of this
 * bucket.
 *
 * Deliberately self-contained rather than importing
 * lib/vision/generate-location-photo.ts or lib/supabase/admin.ts directly:
 * both are `import "server-only"`, which resolves to a module that
 * unconditionally throws outside Next.js's own "react-server" build
 * condition — a plain `tsx` run doesn't set that condition, so importing
 * either here would fail immediately. The generation prompt and the admin
 * client construction are duplicated below instead (small, and not likely
 * to drift — if generate-location-photo.ts's prompt changes, consider
 * updating this to match, but it's not load-bearing for anything the app
 * serves live).
 *
 * Usage: node --env-file=.env.local -e "require('tsx/cjs')" (not this —
 * simplest is `pnpm dlx tsx scripts/seed-stock-location-photos.ts`, since
 * this script loads its own .env.local via process.loadEnvFile).
 * Prints, at the end, the exact array to paste into
 * lib/stock-location-photos.ts's STOCK_LOCATION_PHOTO_NAMES.
 */
import { createClient } from "@supabase/supabase-js";
import { generateImage, type ImageModel } from "ai";
import referenceLocations from "../src/lib/reference/starter-inventory-locations.json";

process.loadEnvFile(".env.local");

// generate-location-photo.ts's own PRIMARY_MODEL ("google/gemini-3.1-flash-image-preview")
// is currently rejected outright by the Gateway ("is a language model, not
// an image model") — confirmed live while first running this script, not
// assumed. That's a real bug in the two already-shipped features built on
// it this session (this file's own generate-location-photo.ts and
// generate-studio-photo.ts's Wardrobe Photo Studio) — both still work only
// because their fallback (openai/gpt-image-2) picks up the slack, at the
// cost of a guaranteed-to-fail extra round-trip and a scary error log on
// every single call. Flagged to the user; not fixed here (out of scope for
// a one-time seed script) — this script just skips straight to the model
// that's actually confirmed working rather than reproducing a doomed
// primary/fallback dance with a 100%-failure first leg.
const MODEL: ImageModel = "openai/gpt-image-2";
const CALL_TIMEOUT_MS = 45_000;
// gpt-image-2 doesn't support the `aspectRatio` param generate-location-photo.ts
// normally uses (silently ignored with a warning) — `size` is its real
// knob; 1536x1024 (~3:2) is its closest landscape option to the location
// hero's 16:9 banner shape.
const SIZE = "1536x1024";

function buildPrompt(roomType: string): string {
  return `A professional, photorealistic interior/real-estate-photography style photo of a clean, well-organized, tidy ${roomType}. Bright, natural lighting, inviting and realistic — not a rendering or illustration. No people, no visible text, logos, or watermarks.`;
}

function slug(name: string): string {
  return `${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.png`;
}

async function generateOne(roomType: string): Promise<string> {
  const { images } = await generateImage({
    model: MODEL,
    prompt: buildPrompt(roomType),
    size: SIZE,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  });
  if (images.length === 0) throw new Error("Model returned no image.");
  return images[0].base64;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local).");
  const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const names = referenceLocations as string[];
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const name of names) {
    process.stdout.write(`Generating "${name}"... `);
    try {
      const base64 = await generateOne(name);
      const { error } = await supabase.storage.from("stock-photos").upload(slug(name), Buffer.from(base64, "base64"), {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw new Error(error.message);
      console.log("done");
      succeeded.push(name);
    } catch (error) {
      console.log("FAILED:", error instanceof Error ? error.message : error);
      failed.push(name);
    }
  }

  console.log(`\n${succeeded.length}/${names.length} succeeded.`);
  if (failed.length > 0) console.log("Failed:", failed);
  console.log("\nPaste into lib/stock-location-photos.ts's STOCK_LOCATION_PHOTO_NAMES:\n");
  console.log(JSON.stringify(succeeded, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
