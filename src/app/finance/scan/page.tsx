"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { useReceiptScanSession } from "@/lib/receipt-scan-session-store";
import { getSharedStream, setSharedStream, hasLiveTracks, stopCameraStream } from "@/lib/camera-stream";
import { resizeImage } from "@/lib/crop-image";
import { cn } from "@/lib/utils";

type Mode = "requesting" | "live" | "analyzing" | "denied";

// Same "ask the browser to negotiate its real capability" reasoning as
// /capture's own constraints (src/app/capture/page.tsx) — no explicit
// resolution meant a blurry stretched-up default.
const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
  audio: false,
};

/**
 * Receipt Capture (docs/Personal Finance PRD.md §35, Receipt Scanning
 * Addendum §2) — deliberately simpler than /capture's own camera screen:
 * a receipt is captured whole, no per-photo crop step (a receipt's edges
 * matter far less than an inventory item's tight bounding box). Multiple
 * photos in one session covers both scan modes: one photo = a single
 * receipt, several = a stack of receipts or a multi-page statement.
 */
export default function ReceiptCapturePage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>("requesting");

  const photos = useReceiptScanSession((s) => s.photos);
  const addPhoto = useReceiptScanSession((s) => s.addPhoto);
  const removePhoto = useReceiptScanSession((s) => s.removePhoto);
  const runExtraction = useReceiptScanSession((s) => s.runExtraction);
  const extractError = useReceiptScanSession((s) => s.extractError);
  const reset = useReceiptScanSession((s) => s.reset);

  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const categoryRules = useInventoryStore((s) => s.categoryRules);
  const accounts = useInventoryStore((s) => s.accounts);

  useEffect(() => {
    reset();
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
    };
  }, []);

  useEffect(() => {
    if (mode === "live" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  const handleShutter = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    // Same downscale-always step /capture's handleUsePhoto uses — a raw
    // camera frame is large enough on its own to matter for upload size.
    addPhoto(await resizeImage(dataUrl));
  }, [addPhoto]);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      addPhoto(await resizeImage(reader.result as string));
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleAnalyze() {
    if (photos.length === 0 || !currentHouseholdId) return;
    setMode("analyzing");
    await runExtraction({ householdId: currentHouseholdId, userId: currentUserId, categories: financeCategories, categoryRules, accounts });
    const { drafts, extractError: err } = useReceiptScanSession.getState();
    if (err || !drafts) return;
    const pendingCount = drafts.filter((d) => d.status === "pending").length;
    router.replace(pendingCount > 1 ? "/finance/scan/review-batch" : "/finance/scan/review");
  }

  const dark = mode === "live";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink" : "bg-background")}>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFilePicked} />

      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => {
            stopCameraStream();
            reset();
            router.replace("/finance/dashboard");
          }}
          aria-label="Close"
          className={cn("tap-target flex size-10 items-center justify-center rounded-full", dark ? "bg-white/10 text-white" : "bg-surface-muted text-ink")}
        >
          <Icon name="close" size={20} />
        </button>
        <p className={cn("text-body font-medium", dark ? "text-white" : "text-ink")}>Scan Receipt</p>
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
                <Icon name="receipt" size={26} className="text-yellow" />
              </div>
              <div>
                <p className="text-item-title font-semibold text-ink">Camera access is off</p>
                <p className="mt-1 text-body text-muted-foreground">Enable camera access for Shohaz in your browser settings, or choose a photo instead.</p>
              </div>
            </div>
            {photos.length > 0 && (
              <div className="flex w-full max-w-xs gap-2 overflow-x-auto">
                {photos.map((p, i) => (
                  <div key={i} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="size-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      aria-label="Remove photo"
                      className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white"
                    >
                      <Icon name="close" size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="tap-target h-11 w-full max-w-xs rounded-full bg-surface-muted text-body font-medium text-ink"
            >
              {photos.length > 0 ? "Choose another photo" : "Choose a photo"}
            </button>
            {photos.length > 0 && (
              <button type="button" onClick={handleAnalyze} className="tap-target h-11 w-full max-w-xs rounded-full bg-ink text-body font-medium text-white">
                Analyze {photos.length} photo{photos.length === 1 ? "" : "s"}
              </button>
            )}
          </div>
        )}

        {mode === "analyzing" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            {extractError ? (
              <>
                <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8">
                  <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
                    <Icon name="danger" size={26} className="text-danger" />
                  </div>
                  <div>
                    <p className="text-item-title font-semibold text-ink">Couldn&apos;t analyze your receipt</p>
                    <p className="mt-1 text-body text-muted-foreground">{extractError.message}</p>
                  </div>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {extractError.retryable && (
                    <button type="button" onClick={handleAnalyze} className="tap-target h-11 w-full rounded-full bg-ink text-body font-medium text-white">
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMode(hasLiveTracks(streamRef.current) ? "live" : "denied")}
                    className="tap-target h-11 w-full rounded-full bg-surface-muted text-body font-medium text-ink"
                  >
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <Icon name="spinner" size={32} className="animate-spin text-ink" />
                <p className="text-body font-medium text-ink">Analyzing your receipt…</p>
                <p className="text-caption text-muted-foreground">Reading store, items, and total.</p>
              </>
            )}
          </div>
        )}

        {mode === "live" && <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />}
      </div>

      {mode === "live" && (
        <div className="flex flex-col gap-3 bg-ink px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
          {photos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto">
              {photos.map((p, i) => (
                <div key={i} className="relative size-16 shrink-0 overflow-hidden rounded-lg border border-white/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="size-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="Remove photo"
                    className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-black/60 text-white"
                  >
                    <Icon name="close" size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between px-4">
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
              className="tap-target flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20"
            >
              <span className="size-12 rounded-full bg-white" />
            </button>
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={photos.length === 0}
              className={cn(
                "tap-target flex h-11 items-center justify-center rounded-full px-4 text-body font-medium",
                photos.length === 0 ? "bg-white/10 text-white/40" : "bg-white text-ink"
              )}
            >
              Analyze
            </button>
          </div>
          <p className="text-center text-caption text-white/60">
            {photos.length === 0 ? "Capture one receipt, or several for a statement." : `${photos.length} photo${photos.length === 1 ? "" : "s"} captured`}
          </p>
        </div>
      )}
    </div>
  );
}
