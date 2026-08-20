"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactCrop, { type Crop, type PixelCrop as RICPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Icon } from "@/components/icon";
import { useCaptureSession } from "@/lib/capture-session-store";
import { useInventoryStore } from "@/lib/store";
import { getCroppedImage, resizeImage, rotateImage, scaleCropToNatural } from "@/lib/crop-image";
import { getSharedStream, setSharedStream, hasLiveTracks, stopCameraStream } from "@/lib/camera-stream";
import { cn } from "@/lib/utils";

type Mode = "requesting" | "live" | "preview" | "analyzing" | "denied";

// No explicit resolution meant the browser was free to pick a low default
// (often 640x480) that then got stretched to fill the screen via
// object-cover — the live preview (and the captured photo itself, since
// the shutter canvas is sized to the stream's actual videoWidth/videoHeight)
// read as blurry as a result. Asking for a high ideal resolution lets the
// browser negotiate the camera's real capability instead.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

// Starts covering the whole photo (matches the "show the whole image, don't
// silently exclude parts of it" fix) — react-image-crop's crop box is fully
// drag/resize-able from here via its own handles, unlike react-easy-crop's
// fixed-aspect pan-and-zoom, which could only ever select a region shaped
// exactly like the source photo — never an arbitrary one.
const FULL_CROP: Crop = { unit: "%", x: 0, y: 0, width: 100, height: 100 };

export default function CameraCapturePage() {
  return (
    <Suspense>
      <CameraCaptureInner />
    </Suspense>
  );
}

function CameraCaptureInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const [mode, setMode] = useState<Mode>("requesting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>(FULL_CROP);
  const [completedCrop, setCompletedCrop] = useState<RICPixelCrop>();
  const [cropping, setCropping] = useState(false);
  const [rotatingPreview, setRotatingPreview] = useState(false);

  const photos = useCaptureSession((s) => s.photos);
  const addPhoto = useCaptureSession((s) => s.addPhoto);
  const removePhoto = useCaptureSession((s) => s.removePhoto);
  const setDestination = useCaptureSession((s) => s.setDestination);
  const setLinkTransactionId = useCaptureSession((s) => s.setLinkTransactionId);
  const runDetection = useCaptureSession((s) => s.runDetection);
  const detectError = useCaptureSession((s) => s.detectError);
  const reset = useCaptureSession((s) => s.reset);
  const lastUsedDestination = useInventoryStore((s) => s.lastUsedDestination);

  useEffect(() => {
    // "Add another photo" (from /capture/review) routes back here with
    // ?continue=1 to resume the in-progress session — otherwise this ran
    // unconditionally on every mount, wiping already-captured photos and
    // silently reverting whatever destination the user had just picked via
    // "Change" back to lastUsedDestination. A fresh entry (FAB, or a
    // Location/Container's "Add items" link) has no continue param and
    // should reset, same as before.
    if (searchParams.get("continue")) return;
    reset();
    const locationId = searchParams.get("locationId");
    const containerId = searchParams.get("containerId");
    setDestination(
      locationId
        ? { locationId, containerId: containerId ?? null }
        : lastUsedDestination ?? { locationId: null, containerId: null }
    );
    // Household Ledger PRD §26 — the "Add to Home" CTA on a finance
    // capture-nudge push notification opens the camera at
    // /capture?linkTransactionId=<id>. Carried through the session (not
    // re-read on every mount) so it survives the /capture <-> /capture/review
    // round trip and "Add another photo," same as destination above.
    const linkTransactionId = searchParams.get("linkTransactionId");
    if (linkTransactionId) setLinkTransactionId(linkTransactionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      // Reuse a still-live stream from an earlier mount in this session
      // instead of asking for the camera again.
      const existing = getSharedStream();
      if (hasLiveTracks(existing)) {
        streamRef.current = existing;
        setMode("live");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setSharedStream(stream);
        setMode("live");
      } catch {
        if (!cancelled) setMode("denied");
      }
    }
    start();
    return () => {
      cancelled = true;
      // Deliberately not stopping the stream here — it's kept alive across
      // this component unmounting so revisiting /capture doesn't re-request
      // the camera. Explicitly closing the camera (below) stops it for real.
    };
  }, []);

  // The <video> element only mounts once mode === "live", so the stream can
  // only be attached after that render commits — not inside the effect
  // above, where videoRef.current is still null.
  useEffect(() => {
    if (mode === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  // Presenting a native sheet over the page (the OS photo picker, in
  // particular) can suspend or fully stop the getUserMedia stream on iOS
  // Safari — reacquiring only when needed avoids an unnecessary permission
  // re-prompt on the (usual) case where the stream is still alive.
  const returnToLive = useCallback(async () => {
    if (hasLiveTracks(streamRef.current)) {
      setMode("live");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
      streamRef.current = stream;
      setSharedStream(stream);
      setMode("live");
    } catch {
      setMode("denied");
    }
  }, []);

  const resetCrop = useCallback(() => {
    setCrop(FULL_CROP);
    setCompletedCrop(undefined);
  }, []);

  // A live capture has no EXIF tag to auto-correct from, and even a
  // library photo's tag doesn't cover every device/browser reliably — this
  // is the direct fix for "came out sideways/upside-down," independent of
  // why: the user rotates it themselves, right where they'd notice it.
  // Rotates the actual photo data (rather than passing a rotation prop
  // through to the crop tool, the way the previous crop library did) since
  // react-image-crop has no rotation concept of its own — the crop
  // selection resets after, since the rotated frame's dimensions can swap.
  async function handleRotatePreview() {
    if (!previewUrl) return;
    setRotatingPreview(true);
    try {
      const rotated = await rotateImage(previewUrl, 90);
      setPreviewUrl(rotated);
      resetCrop();
    } finally {
      setRotatingPreview(false);
    }
  }

  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    resetCrop();
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
    setMode("preview");
  }, [resetCrop]);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      resetCrop();
      setPreviewUrl(reader.result as string);
      setMode("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleRetake() {
    setPreviewUrl(null);
    returnToLive();
  }

  async function handleUsePhoto() {
    if (!previewUrl) return;
    setCropping(true);
    try {
      // Always goes through a downscale, whether or not the user actually
      // touched the crop — an unresized library photo can be tens of MB,
      // large enough on its own to blow past the request size limit on save.
      const img = imgRef.current;
      const finalPhoto =
        completedCrop && img && completedCrop.width > 0 && completedCrop.height > 0
          ? await getCroppedImage(previewUrl, scaleCropToNatural(completedCrop, img))
          : await resizeImage(previewUrl);
      addPhoto(finalPhoto);
      setPreviewUrl(null);
      await returnToLive();
    } finally {
      setCropping(false);
    }
  }

  async function handleReviewAndSave() {
    // A dedicated screen, not the live camera feed with just the button
    // label swapped — the camera was staying visible (and, worse, a
    // failure like Gemini being overloaded left it stuck there forever
    // with no feedback; see runDetection's catch).
    setMode("analyzing");
    await runDetection();
    if (useCaptureSession.getState().detectError) return;
    // replace, not push — the whole capture -> review -> save flow should
    // occupy a single history slot above wherever the user actually came
    // from (a Container/Location page, typically), so the destination
    // page's own back button returns there directly instead of stepping
    // back through stale flow screens one at a time.
    router.replace("/capture/review");
  }

  const dark = mode === "live" || mode === "preview";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink" : "bg-background")}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />

      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            stopCameraStream();
            router.replace("/");
          }}
          aria-label="Close camera"
          className={cn(
            "tap-target flex size-10 items-center justify-center rounded-full",
            dark ? "bg-white/10 text-white" : "bg-white text-ink shadow-sm"
          )}
        >
          <Icon name="close" size={20} />
        </button>
        {photos.length > 0 && (
          <span className="rounded-full bg-white/10 px-3 py-1.5 text-caption font-medium text-white">
            Session · {photos.length} photo{photos.length === 1 ? "" : "s"}
          </span>
        )}
        <div className="size-10" />
      </header>

      <div className="relative flex-1 overflow-hidden">
        {mode === "requesting" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-ink">
            <Icon name="spinner" size={28} className="animate-spin" />
            <p className="text-body text-muted-foreground">Requesting camera access…</p>
          </div>
        )}

        {mode === "denied" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8">
              <div className="flex size-14 items-center justify-center rounded-full bg-brand-100">
                <Icon name="camera" size={26} className="text-yellow" />
              </div>
              <div>
                <p className="text-item-title font-semibold text-ink">Camera access is off</p>
                <p className="mt-1 text-body text-muted-foreground">
                  Enable camera access for Shohaz in your browser settings, or add this item manually instead.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.replace("/add")}
              className="tap-target h-11 w-full max-w-xs rounded-full bg-ink text-body font-medium text-white"
            >
              Enter manually
            </button>
          </div>
        )}

        {mode === "analyzing" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            {detectError ? (
              <>
                <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8">
                  <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
                    <Icon name="danger" size={26} className="text-danger" />
                  </div>
                  <div>
                    <p className="text-item-title font-semibold text-ink">Couldn&apos;t analyze your photos</p>
                    <p className="mt-1 text-body text-muted-foreground">{detectError.message}</p>
                  </div>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {detectError.retryable && (
                    <button
                      type="button"
                      onClick={handleReviewAndSave}
                      className="tap-target h-11 w-full rounded-full bg-ink text-body font-medium text-white"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode("live")}
                    className="tap-target h-11 w-full rounded-full border border-border bg-white text-body font-medium text-ink"
                  >
                    Back to camera
                  </button>
                </div>
              </>
            ) : (
              <>
                <Icon name="spinner" size={28} className="animate-spin text-ink" />
                <p className="text-body text-muted-foreground">Analyzing {photos.length === 1 ? "your photo" : `${photos.length} photos`}…</p>
              </>
            )}
          </div>
        )}

        {mode === "live" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-linear-to-t from-black/60 to-transparent px-6 pb-8 pt-10">
              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={handleReviewAndSave}
                  className="tap-target h-11 w-full max-w-xs rounded-full bg-yellow text-body font-medium text-white"
                >
                  Review & Save ({photos.length})
                </button>
              )}
              <div className="flex w-full items-center justify-center gap-10">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Choose from library"
                  className="tap-target flex size-11 items-center justify-center rounded-full bg-white/10 text-white"
                >
                  <Icon name="gallery" size={20} />
                </button>
                <button
                  type="button"
                  onClick={handleShutter}
                  aria-label="Capture photo"
                  className="flex size-18 items-center justify-center rounded-full border-4 border-white bg-white/20"
                >
                  <span className="size-14 rounded-full bg-white" />
                </button>
                <div className="size-11" />
              </div>
            </div>
          </>
        )}

        {mode === "preview" && previewUrl && (
          <div className="flex h-full flex-col">
            {/* p-5: react-image-crop's corner resize handles are positioned
                half-outside the image's own edge (CSS transform, so its
                center sits exactly on the corner). Verified live (Playwright
                + a real drag gesture) that without this padding, whenever
                the photo's rendered size touches this container's edge on
                any side — routine for a landscape photo in a portrait
                viewport, i.e. most captures — the corner handles on that
                side get pushed out of the interactive area entirely and
                stop receiving pointer events at all: the crop silently
                never changes from the full-photo default no matter how the
                user drags, which is exactly what read as "sending the
                uncropped image." Padding keeps the handles' full hit area
                inside the container regardless of the photo's aspect ratio. */}
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-5">
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} className="max-h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={previewUrl} alt="Photo to crop" className="max-h-[70vh] max-w-full object-contain" />
              </ReactCrop>
              <button
                type="button"
                onClick={handleRotatePreview}
                disabled={rotatingPreview}
                aria-label="Rotate photo 90 degrees"
                className="tap-target absolute right-3 top-3 flex size-10 items-center justify-center rounded-full bg-black/50 text-white disabled:opacity-60"
              >
                {rotatingPreview ? <Icon name="spinner" size={18} className="animate-spin" /> : <Icon name="rotate" size={18} />}
              </button>
            </div>
            <div className="flex flex-col gap-3 bg-ink px-6 py-4">
              <p className="text-center text-caption text-white/60">Drag the corners to crop just the part you want.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRetake}
                  disabled={cropping}
                  className="tap-target h-11 flex-1 rounded-full bg-white/10 text-body font-medium text-white disabled:opacity-60"
                >
                  Retake
                </button>
                <button
                  type="button"
                  onClick={handleUsePhoto}
                  disabled={cropping}
                  className="tap-target h-11 flex-1 rounded-full bg-yellow text-body font-medium text-white disabled:opacity-60"
                >
                  {cropping ? "Cropping…" : "Use Photo"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {mode === "live" && photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto bg-ink px-4 pb-4">
          {photos.map((p, i) => (
            <div key={i} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p} alt={`Captured item ${i + 1}`} className="size-14 rounded-lg bg-white/10 object-contain" />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label="Remove photo"
                className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-white text-ink"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
