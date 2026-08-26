import "server-only";
import { removeBackground } from "@imgly/background-removal-node";

// Server-only background removal (docs/Wardrobe Inventory.md's earlier
// cost-driven deferral of this feature no longer applies) — sibling to
// generate-studio-photo.ts, but a genuinely different kind of operation:
// local segmentation/matting (onnxruntime-node, bundled with the package),
// not a hosted LLM call, so there's no per-image API cost and no
// primary/fallback model pair to fall back between — this either runs
// locally and succeeds, or throws, same as any other local compute step.
//
// "small" trades a little segmentation quality for a materially faster,
// lighter model — appropriate here since the input is already a tightly
// cropped single-item photo (see cropToItem in lib/crop-image.ts), not an
// arbitrary scene the model has to first locate the subject within.
//
// Model/WASM assets are NOT bundled in this package — by default
// removeBackground() fetches them from IMG.LY's CDN on first use and
// caches the result. That's an external runtime dependency on serverless
// (a cold function instance may re-fetch), but self-hosting those assets
// (downloading and committing the .onnx/.wasm files, then pointing
// `publicPath` at them) is a deliberate follow-up, not done here — this
// ships with the library's default hosted assets first.
export async function removeItemBackground(photoDataUrl: string): Promise<Buffer> {
  // removeBackground() only accepts a bare string as an http(s)/file URL, not
  // a data: URL — passing photoDataUrl straight through throws "Unsupported
  // protocol: data:". And a raw Buffer/ArrayBuffer gets wrapped in a Blob
  // with no `type`, which then fails to decode ("Unsupported format: ").
  // So this has to be unpacked into an explicitly-typed Blob ourselves
  // (confirmed against the installed package's actual source, not just its
  // types — see the two failure modes above).
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
