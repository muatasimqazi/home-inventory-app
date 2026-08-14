import type { BoundingBox } from "@/lib/ai";

export interface PixelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

// A library-picked photo comes through completely unresized (a modern
// phone's camera roll photo can be 12+ MP, tens of MB as JPEG and larger
// still once base64-encoded) and the crop output previously kept the
// source's full native resolution — the crop step only cropped, never
// downscaled. Detection payloads (one call, occasionally several photos)
// could then exceed the platform's request body limit and 413. A vision
// model doesn't benefit from resolution far beyond this anyway, so capping
// the long edge here fixes the payload size without a visible quality cost.
const MAX_OUTPUT_DIMENSION = 1600;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", reject);
    image.src = src;
  });
}

export async function getCroppedImage(imageSrc: string, pixelCrop: PixelCrop): Promise<string> {
  const image = await loadImage(imageSrc);
  const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height));
  const outputWidth = Math.round(pixelCrop.width * scale);
  const outputHeight = Math.round(pixelCrop.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't get canvas context");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  return canvas.toDataURL("image/jpeg", 0.85);
}

/** Same downscale as getCroppedImage, but for the (rare) case there's no explicit crop selection yet — treats the whole image as the "crop". */
export async function resizeImage(imageSrc: string): Promise<string> {
  const image = await loadImage(imageSrc);
  return getCroppedImage(imageSrc, { x: 0, y: 0, width: image.naturalWidth, height: image.naturalHeight });
}

// Extra room around a model-provided box, as a fraction of the box's own
// size — a razor-tight crop tends to clip the item's edges since the model's
// box is rarely pixel-perfect; a little context looks more like a real photo.
const BOX_PADDING_FRACTION = 0.08;

// Below this, in either dimension, a box isn't a meaningfully tighter crop
// than the whole photo — not worth trusting over just using the full frame.
const MIN_BOX_FRACTION = 0.02;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** True for a box worth cropping to — present, a real size, and roughly within the frame (a little float slop from the model is fine; it gets clamped below). */
export function isUsableBoundingBox(box: BoundingBox | null | undefined): box is BoundingBox {
  if (!box) return false;
  const { x, y, width, height } = box;
  return (
    [x, y, width, height].every(Number.isFinite) &&
    width > MIN_BOX_FRACTION &&
    height > MIN_BOX_FRACTION &&
    x > -0.1 &&
    y > -0.1 &&
    x < 1.1 &&
    y < 1.1
  );
}

/**
 * Crops just one detected item's own region out of a source photo (with a
 * little padding for context) instead of using the whole photo — the point
 * being that N items detected in one photo no longer all end up sharing one
 * full-size copy of it in storage. Falls back to a plain resize of the
 * whole photo when there's no usable box: the model couldn't localize the
 * item confidently, or it's a single-item photo where the box would be the
 * whole frame anyway.
 */
export async function cropToItem(imageSrc: string, box: BoundingBox | null | undefined): Promise<string> {
  if (!isUsableBoundingBox(box)) return resizeImage(imageSrc);

  const image = await loadImage(imageSrc);
  const padX = box.width * BOX_PADDING_FRACTION;
  const padY = box.height * BOX_PADDING_FRACTION;
  const x0 = clamp01(box.x - padX);
  const y0 = clamp01(box.y - padY);
  const x1 = clamp01(box.x + box.width + padX);
  const y1 = clamp01(box.y + box.height + padY);

  const pixelCrop: PixelCrop = {
    x: Math.round(x0 * image.naturalWidth),
    y: Math.round(y0 * image.naturalHeight),
    width: Math.max(1, Math.round((x1 - x0) * image.naturalWidth)),
    height: Math.max(1, Math.round((y1 - y0) * image.naturalHeight)),
  };

  return getCroppedImage(imageSrc, pixelCrop);
}
