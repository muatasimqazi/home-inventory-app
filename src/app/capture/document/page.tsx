"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactCrop, { type Crop, type PixelCrop as RICPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Icon } from "@/components/icon";
import { useDocumentCapture } from "@/lib/document-capture-store";
import { useInventoryStore } from "@/lib/store";
import { getCroppedImage, resizeImage, rotateImage, scaleCropToNatural } from "@/lib/crop-image";
import { getSharedStream, setSharedStream, hasLiveTracks, stopCameraStream } from "@/lib/camera-stream";
import { cn } from "@/lib/utils";

// Document-scan capture entry point — same separate-addressable-route shape
// as /capture/appliance (see that page's own header comment for why):
// shutter -> crop -> /capture/document/review. Reachable at /capture/document
// directly, or via ?locationId=/&containerId= the same way /capture and
// /add accept them, or through the Scan chooser sheet's "Scan Document" row.

type Mode = "requesting" | "live" | "preview" | "analyzing" | "denied";

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

const FULL_CROP: Crop = { unit: "%", x: 0, y: 0, width: 100, height: 100 };

export default function DocumentCapturePage() {
  return (
    <Suspense>
      <DocumentCaptureInner />
    </Suspense>
  );
}

function DocumentCaptureInner() {
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

  const setPhoto = useDocumentCapture((s) => s.setPhoto);
  const setDestination = useDocumentCapture((s) => s.setDestination);
  const runDetection = useDocumentCapture((s) => s.runDetection);
  const detectError = useDocumentCapture((s) => s.detectError);
  const reset = useDocumentCapture((s) => s.reset);
  const lastUsedDestination = useInventoryStore((s) => s.lastUsedDestination);

  useEffect(() => {
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
      // Not stopping the stream on unmount — same reasoning as
      // capture/appliance/page.tsx: kept alive across this page and
      // /capture/document "Retake" round trips so the browser doesn't
      // re-prompt for permission. stopCameraStream() below closes it for real.
    };
  }, []);

  useEffect(() => {
    if (mode === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

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
      const img = imgRef.current;
      const finalPhoto =
        completedCrop && img && completedCrop.width > 0 && completedCrop.height > 0
          ? await getCroppedImage(previewUrl, scaleCropToNatural(completedCrop, img))
          : await resizeImage(previewUrl);
      setPhoto(finalPhoto);
      setPreviewUrl(null);
      setMode("analyzing");
      await runDetection();
      if (useDocumentCapture.getState().detectError) {
        // Stay on "analyzing" — its own detectError branch is what
        // actually renders the error card, same landing spot
        // handleRetryDetection's failure path uses below.
        return;
      }
      // Deliberately NOT stopping the shared stream here — same fix as
      // capture/appliance/page.tsx's own handleUsePhoto: stopping right
      // before leaving for /capture/document/review meant the review
      // page's "Back to camera" arrow (or scanning a second document right
      // after) always forced a fresh getUserMedia() call, visibly
      // re-prompting for camera permission. The stream now stays live all
      // the way through the review page and is only actually stopped by
      // this page's own "Close camera" button above or by the review
      // page's Save succeeding.
      router.replace("/capture/document/review");
    } finally {
      setCropping(false);
    }
  }

  function handleRetryDetection() {
    setMode("analyzing");
    runDetection().then(() => {
      if (!useDocumentCapture.getState().detectError) {
        router.replace("/capture/document/review");
      }
      // else: stay on "analyzing" — its detectError branch re-renders the
      // error card with the new error.
    });
  }

  const dark = mode === "live" || mode === "preview";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink-fill" : "bg-background")}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />

      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            stopCameraStream();
            router.replace("/dashboard");
          }}
          aria-label="Close camera"
          className={cn(
            "tap-target flex size-10 items-center justify-center rounded-full",
            dark ? "bg-white/10 text-white" : "bg-card text-ink shadow-sm"
          )}
        >
          <Icon name="close" size={20} />
        </button>
        <span className={cn("text-caption font-medium", dark ? "text-white" : "text-ink")}>Scan document</span>
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
            <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8">
              <div className="flex size-14 items-center justify-center rounded-full bg-brand-100">
                <Icon name="camera" size={26} className="text-yellow" />
              </div>
              <div>
                <p className="text-item-title font-semibold text-ink">Camera access is off</p>
                <p className="mt-1 text-body text-muted-foreground">
                  Enable camera access for Schuaz in your browser settings to scan a document.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.replace("/dashboard")}
              className="tap-target h-11 w-full max-w-xs rounded-full bg-ink-fill text-body font-medium text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === "analyzing" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            {detectError ? (
              <>
                <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8">
                  <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
                    <Icon name="danger" size={26} className="text-danger" />
                  </div>
                  <div>
                    <p className="text-item-title font-semibold text-ink">Couldn&apos;t read the document</p>
                    <p className="mt-1 text-body text-muted-foreground">{detectError.message}</p>
                  </div>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {detectError.retryable && (
                    <button
                      type="button"
                      onClick={handleRetryDetection}
                      className="tap-target h-11 w-full rounded-full bg-ink-fill text-body font-medium text-white"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="tap-target h-11 w-full rounded-full border border-border bg-card text-body font-medium text-ink"
                  >
                    Retake photo
                  </button>
                </div>
              </>
            ) : (
              <>
                <Icon name="spinner" size={28} className="animate-spin text-ink" />
                <p className="text-body text-muted-foreground">Reading the document…</p>
              </>
            )}
          </div>
        )}

        {mode === "live" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-6 rounded-xl bg-black/40 px-3 py-2 text-center text-caption text-white/90">
              Frame the whole document so all the text is sharp and readable.
            </div>
          </>
        )}

        {mode === "preview" && previewUrl && (
          <div className="flex h-full flex-col">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-5">
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} className="max-h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={previewUrl} alt="Document to crop" className="max-h-[70vh] max-w-full object-contain" />
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
            <div className="flex flex-col gap-3 bg-ink-fill px-6 py-4">
              <p className="text-center text-caption text-white/60">Crop tight around the document so the text is easy to read.</p>
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
                  {cropping ? "Reading…" : "Use Photo"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* A sibling panel below the video, not an overlay on top of it — see
          capture/page.tsx's identical fix and its own longer comment on why. */}
      {mode === "live" && (
        <div className="flex flex-col items-center gap-4 bg-ink-fill px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
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
      )}
    </div>
  );
}
