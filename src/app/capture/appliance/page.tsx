"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ReactCrop, { type Crop, type PixelCrop as RICPixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import { Icon } from "@/components/icon";
import { useApplianceCapture } from "@/lib/appliance-capture-store";
import { useInventoryStore } from "@/lib/store";
import { getCroppedImage, resizeImage, rotateImage, scaleCropToNatural } from "@/lib/crop-image";
import { getSharedStream, setSharedStream, hasLiveTracks, stopCameraStream } from "@/lib/camera-stream";
import { cn } from "@/lib/utils";

// Appliance-label capture entry point (Household Ledger PRD §27,
// Implementation Plan Workstream 7) — a separate, addressable route from
// the general item-capture flow at src/app/capture/page.tsx, not a mode
// flag bolted onto it. Single photo only (one nameplate/rating label, not
// a multi-item session): shutter -> crop -> /capture/appliance/review.
//
// Reachable today at /capture/appliance directly (e.g. linked from an
// item's "Add appliance" affordance) or via ?locationId=/&containerId=
// query params the same way /capture and /add accept them. Universal Scan's
// chooser sheet (src/components/scan-chooser-sheet.tsx, Workstream 8) is
// expected to add a third "Scan Appliance" row pointing here — deliberately
// left untouched by this workstream so that wiring stays Workstream 8's own
// diff.

type Mode = "requesting" | "live" | "preview" | "analyzing" | "denied";

const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

const FULL_CROP: Crop = { unit: "%", x: 0, y: 0, width: 100, height: 100 };

export default function ApplianceCapturePage() {
  return (
    <Suspense>
      <ApplianceCaptureInner />
    </Suspense>
  );
}

function ApplianceCaptureInner() {
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

  const setPhoto = useApplianceCapture((s) => s.setPhoto);
  const setDestination = useApplianceCapture((s) => s.setDestination);
  const runDetection = useApplianceCapture((s) => s.runDetection);
  const detectError = useApplianceCapture((s) => s.detectError);
  const reset = useApplianceCapture((s) => s.reset);
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
      // capture/page.tsx: kept alive across this page and /capture/appliance
      // "Retake" round trips so the browser doesn't re-prompt for
      // permission. stopCameraStream() below closes it for real.
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
      if (useApplianceCapture.getState().detectError) {
        // Stay on "analyzing" — its own detectError branch is what
        // actually renders the error card (message + Try again/Retake),
        // the same landing spot handleRetryDetection's failure path uses
        // below. Bouncing to "preview" here skipped that card entirely:
        // the user would land back on the crop screen with no explanation
        // of why "Use Photo" didn't proceed.
        return;
      }
      // Only stop the shared stream once we're actually leaving for
      // /capture/appliance/review, not before knowing detection succeeded
      // — same reasoning as capture/page.tsx's handleSave: an earlier stop
      // here meant any detection failure forced a fresh getUserMedia() call
      // on the next Retake (returnToLive() only reuses the stream if
      // hasLiveTracks() is still true), which can visibly re-prompt for
      // camera permission on the very browsers the shared-stream mechanism
      // exists to protect against.
      stopCameraStream();
      router.replace("/capture/appliance/review");
    } finally {
      setCropping(false);
    }
  }

  function handleRetryDetection() {
    setMode("analyzing");
    runDetection().then(() => {
      if (!useApplianceCapture.getState().detectError) {
        stopCameraStream();
        router.replace("/capture/appliance/review");
      }
      // else: stay on "analyzing" — its detectError branch re-renders the
      // error card with the new error. (Previously bounced to "preview"
      // with no previewUrl set, which rendered nothing but the header —
      // see the comment on the equivalent branch in handleUsePhoto above.)
    });
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
        <span className={cn("text-caption font-medium", dark ? "text-white" : "text-ink")}>Scan appliance label</span>
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
                  Enable camera access for Shohaz in your browser settings to scan an appliance label.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.replace("/")}
              className="tap-target h-11 w-full max-w-xs rounded-full bg-ink text-body font-medium text-white"
            >
              Cancel
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
                    <p className="text-item-title font-semibold text-ink">Couldn&apos;t read the label</p>
                    <p className="mt-1 text-body text-muted-foreground">{detectError.message}</p>
                  </div>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {detectError.retryable && (
                    <button
                      type="button"
                      onClick={handleRetryDetection}
                      className="tap-target h-11 w-full rounded-full bg-ink text-body font-medium text-white"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="tap-target h-11 w-full rounded-full border border-border bg-white text-body font-medium text-ink"
                  >
                    Retake photo
                  </button>
                </div>
              </>
            ) : (
              <>
                <Icon name="spinner" size={28} className="animate-spin text-ink" />
                <p className="text-body text-muted-foreground">Reading the label…</p>
              </>
            )}
          </div>
        )}

        {mode === "live" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-6 rounded-xl bg-black/40 px-3 py-2 text-center text-caption text-white/90">
              Frame the manufacturer&apos;s label — usually a sticker or metal plate on the back, side, or inside edge.
            </div>
          </>
        )}

        {mode === "preview" && previewUrl && (
          <div className="flex h-full flex-col">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-5">
              <ReactCrop crop={crop} onChange={(_, percentCrop) => setCrop(percentCrop)} onComplete={(c) => setCompletedCrop(c)} className="max-h-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img ref={imgRef} src={previewUrl} alt="Appliance label to crop" className="max-h-[70vh] max-w-full object-contain" />
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
              <p className="text-center text-caption text-white/60">Crop tight around the label so the model number and serial are easy to read.</p>
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
          capture/page.tsx's identical fix and its own longer comment on why
          (real camera UI overlapping the live view obscured exactly the
          part of the frame users needed to see while composing a shot). */}
      {mode === "live" && (
        <div className="flex flex-col items-center gap-4 bg-ink px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6">
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
