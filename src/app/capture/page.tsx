"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { useCaptureSession } from "@/lib/capture-session-store";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";

type Mode = "requesting" | "live" | "preview" | "denied";

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
  const [saving, setSaving] = useState(false);

  const photos = useCaptureSession((s) => s.photos);
  const addPhoto = useCaptureSession((s) => s.addPhoto);
  const removePhoto = useCaptureSession((s) => s.removePhoto);
  const setDestination = useCaptureSession((s) => s.setDestination);
  const runDetection = useCaptureSession((s) => s.runDetection);
  const reset = useCaptureSession((s) => s.reset);
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
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMode("live");
      } catch {
        if (!cancelled) setMode("denied");
      }
    }
    start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
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

  const handleShutter = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setPreviewUrl(canvas.toDataURL("image/jpeg", 0.85));
    setMode("preview");
  }, []);

  function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPreviewUrl(reader.result as string);
      setMode("preview");
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleReviewAndSave() {
    setSaving(true);
    await runDetection();
    router.push("/capture/review");
  }

  const dark = mode === "live" || mode === "preview";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink" : "bg-background")}>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFilePicked} />

      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.push("/")}
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

        {mode === "live" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 bg-linear-to-t from-black/60 to-transparent px-6 pb-8 pt-10">
              {photos.length > 0 && (
                <button
                  type="button"
                  onClick={handleReviewAndSave}
                  disabled={saving}
                  className="tap-target h-11 w-full max-w-xs rounded-full bg-yellow text-body font-medium text-white disabled:opacity-60"
                >
                  {saving ? "Analyzing…" : `Review & Save (${photos.length})`}
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Captured preview" className="flex-1 object-cover" />
            <div className="flex gap-3 bg-ink px-6 py-6">
              <button
                type="button"
                onClick={() => {
                  setPreviewUrl(null);
                  setMode("live");
                }}
                className="tap-target h-11 flex-1 rounded-full bg-white/10 text-body font-medium text-white"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={() => {
                  addPhoto(previewUrl);
                  setPreviewUrl(null);
                  setMode("live");
                }}
                className="tap-target h-11 flex-1 rounded-full bg-yellow text-body font-medium text-white"
              >
                Use Photo
              </button>
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
