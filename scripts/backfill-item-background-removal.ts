/**
 * One-time (re-runnable) backfill: generates a background-removed PNG for
 * every active item that already has a cover photo but does not yet have
 * items.background_removed_photo_path set.
 *
 * Deliberately self-contained rather than importing
 * lib/vision/remove-background.ts or lib/supabase/admin.ts directly: both
 * are `import "server-only"`, which resolves to a module that
 * unconditionally throws outside Next.js's own "react-server" build
 * condition — a plain `tsx` run doesn't set that condition, so importing
 * either here would fail immediately. The data-URL unpacking/background
 * removal call and the admin client construction are duplicated below
 * instead, matching the app's live remove-background route behavior.
 *
 * Usage: pnpm dlx tsx scripts/backfill-item-background-removal.ts
 */
import { removeBackground } from "@imgly/background-removal-node";
import { createClient } from "@supabase/supabase-js";
import { newId } from "../src/lib/id";

process.loadEnvFile(".env.local");

const BUCKET = "item-photos";
const PAGE_SIZE = 1_000;

interface BackfillItem {
  id: string;
  household_id: string;
  name: string;
  cover_photo_path: string;
}

async function removeItemBackground(photoDataUrl: string): Promise<Buffer> {
  const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(photoDataUrl);
  if (!match) throw new Error("removeItemBackground: expected a base64 image data URL.");
  const [, mimeType, base64] = match;
  const source = new Blob([Buffer.from(base64, "base64")], { type: mimeType });

  const blob = await removeBackground(source, {
    model: "small",
    output: { format: "image/png" },
  });
  return Buffer.from(await blob.arrayBuffer());
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const mimeType = blob.type || "image/jpeg";
  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local).");

  const supabase = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const items: BackfillItem[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("items")
      .select("id, household_id, name, cover_photo_path")
      .eq("status", "active")
      .not("cover_photo_path", "is", null)
      .is("background_removed_photo_path", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw new Error(error.message);
    const page = (data ?? []) as BackfillItem[];
    items.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (items.length === 0) {
    console.log("0 items to process.");
    return;
  }

  console.log(`Found ${items.length} items to process.\n`);

  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const item of items) {
    process.stdout.write(`Backfilling "${item.name}" (${item.id})... `);
    try {
      const { data: coverPhoto, error: downloadError } = await supabase.storage.from(BUCKET).download(item.cover_photo_path);
      if (downloadError) throw new Error(downloadError.message);
      if (!coverPhoto) throw new Error("Storage download returned no blob.");

      const resultPng = await removeItemBackground(await blobToDataUrl(coverPhoto));
      const path = `${item.household_id}/${newId()}`;
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, resultPng, { contentType: "image/png" });
      if (uploadError) throw new Error(uploadError.message);

      const { error: updateError } = await supabase
        .from("items")
        .update({ background_removed_photo_path: path })
        .eq("id", item.id)
        .is("background_removed_photo_path", null);
      if (updateError) throw new Error(updateError.message);

      console.log("done");
      succeeded.push(item.id);
    } catch (error) {
      console.log("FAILED:", error instanceof Error ? error.message : error);
      failed.push(item.id);
    }
  }

  console.log(`\n${succeeded.length}/${items.length} succeeded.`);
  if (failed.length > 0) console.log("Failed:", failed);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
