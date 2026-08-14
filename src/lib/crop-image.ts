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
