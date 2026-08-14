"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Cropper, { type Area } from "react-easy-crop";
import { Icon } from "@/components/icon";
import { useCaptureSession } from "@/lib/capture-session-store";
import { useInventoryStore } from "@/lib/store";
import { getCroppedImage } from "@/lib/crop-image";
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

  const [mode, setMode] = useState<Mode>("requesting");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropping, setCropping] = useState(false);
  // The crop step used to hard-code a 4:3 (landscape) aspect regardless of
  // the actual photo — most phone photos are portrait, so at the default
  // zoom the crop box only showed a small center slice and silently
  // excluded the rest. Deriving it from the real photo dimensions (known
  // synchronously from the capture canvas for a shutter photo, or probed
  // via Image() for a library pick) means the crop starts framing the
  // whole photo, matching its real shape.
  const [mediaAspect, setMediaAspect] = useState<number | null>(null);

  const photos = useCaptureSession((s) => s.photos);
  const addPhoto = useCaptureSession((s) => s.addPhoto);
  const removePhoto = useCaptureSession((s) => s.removePhoto);
  const setDestination = useCaptureSession((s) => s.setDestination);
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
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedAreaPixels(null);
  }, []);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

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
    setMediaAspect(canvas.width / canvas.height);
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
    setMode("preview");
  }, [resetCrop]);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // Probe real dimensions before showing the crop step so the aspect
      // is right from the first frame, instead of starting at a wrong
      // default and jumping once decoded.
      const probe = new Image();
      probe.onload = () => {
        resetCrop();
        setMediaAspect(probe.naturalWidth / probe.naturalHeight);
        setPreviewUrl(dataUrl);
        setMode("preview");
      };
      probe.src = dataUrl;
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
      const finalPhoto = croppedAreaPixels ? await getCroppedImage(previewUrl, croppedAreaPixels) : previewUrl;
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
    router.push("/capture/review");
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
            router.push("/");
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
              onClick={() => router.push("/add")}
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
            <div className="relative flex-1 bg-black">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={mediaAspect ?? 4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={(size) => setMediaAspect(size.naturalWidth / size.naturalHeight)}
              />
            </div>
            <div className="flex flex-col gap-3 bg-ink px-6 py-4">
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom"
                className="w-full accent-yellow"
              />
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
              <img src={p} alt={`Captured item ${i + 1}`} className="size-14 rounded-lg object-cover" />
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
