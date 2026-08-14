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

// A phone photo (front camera, or shot in any orientation other than
// "camera held normally") carries an EXIF Orientation tag rather than
// physically rotated pixels — the file's raw bytes are however the sensor
// captured them, and the tag says how to display it right-side up. A plain
// `new Image()` decode doesn't reliably honor that tag the same way in
// every browser/canvas context, so a canvas re-encode (which this module
// does for every photo, one way or another) could silently bake in the
// wrong rotation permanently. `imageOrientation: "from-image"` is the
// browser applying that correction itself, explicitly, rather than us
// guessing at (or hand-parsing) the tag.
async function loadOrientedBitmap(src: string): Promise<ImageBitmap> {
  const blob = await (await fetch(src)).blob();
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

/** The bounding box a rotated width x height rectangle occupies — e.g. at 90/270 degrees its edges swap. Mirrors react-easy-crop's own reference implementation for combining crop + rotation. */
function rotatedBoundingSize(width: number, height: number, rotationDeg: number) {
  const rotRad = (rotationDeg * Math.PI) / 180;
  return {
    width: Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
    height: Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
  };
}

/**
 * `rotationDeg` is the manual rotation a user applied in the crop step
 * (react-easy-crop's own `rotation`/`onRotationChange`, for whenever a
 * photo comes out sideways/upside-down and EXIF auto-correction either
 * doesn't apply — a live camera capture has no EXIF tag to read — or isn't
 * enough). `pixelCrop` is reported by react-easy-crop relative to the
 * already-rotated frame, so the source has to actually be rotated onto an
 * intermediate canvas first — cropping straight from the unrotated source
 * with those coordinates would grab the wrong region entirely.
 */
export async function getCroppedImage(imageSrc: string, pixelCrop: PixelCrop, rotationDeg = 0): Promise<string> {
  const bitmap = await loadOrientedBitmap(imageSrc);
  try {
    let source: ImageBitmap | HTMLCanvasElement = bitmap;
    if (rotationDeg % 360 !== 0) {
      const rotRad = (rotationDeg * Math.PI) / 180;
      const { width: boundWidth, height: boundHeight } = rotatedBoundingSize(bitmap.width, bitmap.height, rotationDeg);
      const rotatedCanvas = document.createElement("canvas");
      rotatedCanvas.width = Math.round(boundWidth);
      rotatedCanvas.height = Math.round(boundHeight);
      const rotatedCtx = rotatedCanvas.getContext("2d");
      if (!rotatedCtx) throw new Error("Couldn't get canvas context");
      rotatedCtx.translate(boundWidth / 2, boundHeight / 2);
      rotatedCtx.rotate(rotRad);
      rotatedCtx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
      source = rotatedCanvas;
    }

    const scale = Math.min(1, MAX_OUTPUT_DIMENSION / Math.max(pixelCrop.width, pixelCrop.height));
    const outputWidth = Math.round(pixelCrop.width * scale);
    const outputHeight = Math.round(pixelCrop.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't get canvas context");

    ctx.drawImage(
      source,
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
  } finally {
    bitmap.close();
  }
}

/** Same downscale (and orientation fix) as getCroppedImage, but for the (rare) case there's no explicit crop selection yet — treats the whole image as the "crop". */
export async function resizeImage(imageSrc: string): Promise<string> {
  const bitmap = await loadOrientedBitmap(imageSrc);
  const { width, height } = bitmap;
  bitmap.close();
  return getCroppedImage(imageSrc, { x: 0, y: 0, width, height });
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

  const bitmap = await loadOrientedBitmap(imageSrc);
  const { width: naturalWidth, height: naturalHeight } = bitmap;
  bitmap.close();

  const padX = box.width * BOX_PADDING_FRACTION;
  const padY = box.height * BOX_PADDING_FRACTION;
  const x0 = clamp01(box.x - padX);
  const y0 = clamp01(box.y - padY);
  const x1 = clamp01(box.x + box.width + padX);
  const y1 = clamp01(box.y + box.height + padY);

  const pixelCrop: PixelCrop = {
    x: Math.round(x0 * naturalWidth),
    y: Math.round(y0 * naturalHeight),
    width: Math.max(1, Math.round((x1 - x0) * naturalWidth)),
    height: Math.max(1, Math.round((y1 - y0) * naturalHeight)),
  };

  return getCroppedImage(imageSrc, pixelCrop);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

export async function dataUrlToFile(dataUrl: string, filename = "photo.jpg"): Promise<File> {
  const blob = await (await fetch(dataUrl)).blob();
  return new File([blob], filename, { type: blob.type || "image/jpeg" });
}

/**
 * Normalizes any picked/uploaded photo before it's stored anywhere in the
 * app: bakes in its real orientation (see loadOrientedBitmap above) and
 * caps its resolution — the same treatment capture-flow photos already get,
 * now shared by every cover-photo upload path too (the location/container/
 * item "change photo" buttons, and the create-with-photo pickers), since
 * they all upload the raw picked File directly otherwise.
 */
export async function normalizeUploadedPhoto(file: File): Promise<File> {
  const dataUrl = await fileToDataUrl(file);
  const resized = await resizeImage(dataUrl);
  return dataUrlToFile(resized, file.name);
}
