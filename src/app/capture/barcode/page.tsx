"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useBarcodeCapture } from "@/lib/barcode-capture-store";
import { useInventoryStore } from "@/lib/store";
import { getSharedStream, setSharedStream, hasLiveTracks, stopCameraStream } from "@/lib/camera-stream";
import { useBarcodeDetectorSupport } from "@/hooks/use-barcode-detector-support";
import { cn } from "@/lib/utils";

// Barcode-scan capture entry point — a separate, addressable route from
// both the general item-capture flow (src/app/capture/page.tsx) and the
// appliance-label flow (src/app/capture/appliance/), following the same
// self-contained-route shape those two already established: shutter-free
// live detection -> /capture/barcode/review, with its own store
// (lib/barcode-capture-store.ts).
//
// Live detection reuses src/app/scan/page.tsx's exact BarcodeDetector
// pattern (the same declare-global shim, the same requestAnimationFrame
// polling loop, the same manual-entry fallback for browsers without
// BarcodeDetector support) rather than reinventing it — just pointed at
// retail product barcode formats (UPC/EAN) instead of the QR codes that
// page reads off container labels, and resolving into a product lookup
// instead of a container route. The camera *lifecycle* (getUserMedia,
// keeping the stream alive across this page <-> /capture/barcode/review
// round trips) instead follows capture/appliance/page.tsx's shared-stream
// helpers, since — unlike /scan, which is a single closed page — this flow
// has a review step a user can back out of into the camera again.
//
// Reachable at /capture/barcode directly, or via ?locationId=&containerId=
// the same way /capture, /add, and /capture/appliance accept them.
// src/components/scan-chooser-sheet.tsx's chooser adds a fourth "Scan
// Barcode" row pointing here.

type Mode = "requesting" | "scanning" | "denied" | "looking";

const CAMERA_CONSTRAINTS: MediaStreamConstraints = { video: { facingMode: "environment" }, audio: false };

// Retail product barcode symbologies — UPC/EAN cover the vast majority of
// packaged goods.
const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

export default function BarcodeCapturePage() {
  return (
    <Suspense>
      <BarcodeCaptureInner />
    </Suspense>
  );
}

function BarcodeCaptureInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [mode, setMode] = useState<Mode>("requesting");
  const [manualCode, setManualCode] = useState("");
  const detectionSupport = useBarcodeDetectorSupport();

  const setCode = useBarcodeCapture((s) => s.setCode);
  const setDestination = useBarcodeCapture((s) => s.setDestination);
  const runLookup = useBarcodeCapture((s) => s.runLookup);
  const lookupError = useBarcodeCapture((s) => s.lookupError);
  const reset = useBarcodeCapture((s) => s.reset);
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
        setMode("scanning");
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
        setMode("scanning");
      } catch {
        if (!cancelled) setMode("denied");
      }
    }
    start();
    return () => {
      cancelled = true;
      // Not stopping the stream on unmount — same reasoning as
      // capture/appliance/page.tsx: kept alive across this page and
      // /capture/barcode/review round trips so the browser doesn't
      // re-prompt for permission. stopCameraStream() below closes it for
      // real, once the flow is actually done with the camera.
    };
  }, []);

  useEffect(() => {
    if (mode === "scanning" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "scanning" || !videoRef.current || !streamRef.current) return;
    // "checking" (still loading the WASM polyfill — see
    // useBarcodeDetectorSupport's own comment) falls through to here too:
    // this effect just doesn't start yet, and re-runs once detectionSupport
    // settles to "ready" or "unavailable."
    if (detectionSupport !== "ready" || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    let raf = 0;
    let cancelled = false;

    async function tick() {
      if (cancelled || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes[0]?.rawValue) {
          handleResolve(codes[0].rawValue);
          return;
        }
      } catch {
        // ignore per-frame detection errors
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, detectionSupport]);

  async function handleResolve(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed) return;
    setCode(trimmed);
    setMode("looking");
    await runLookup();
    if (useBarcodeCapture.getState().lookupError) {
      // Stay on "looking" — its own lookupError branch renders the error
      // card (message + Try again/Rescan), same reasoning as
      // capture/appliance/page.tsx's handleUsePhoto keeping "analyzing" up
      // for its detectError branch instead of bouncing back to camera with
      // no explanation.
      return;
    }
    stopCameraStream();
    router.replace("/capture/barcode/review");
  }

  function handleRetryLookup() {
    setMode("looking");
    runLookup().then(() => {
      if (!useBarcodeCapture.getState().lookupError) {
        stopCameraStream();
        router.replace("/capture/barcode/review");
      }
    });
  }

  function handleRescan() {
    setMode("scanning");
  }

  const dark = mode === "scanning";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink text-white" : "bg-background text-ink")}>
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
            dark ? "bg-white/10" : "bg-white shadow-sm"
          )}
        >
          <Icon name="close" size={20} />
        </button>
        <span className="text-caption font-medium">Scan a barcode</span>
        <div className="size-10" />
      </header>

      <div className="relative flex-1 overflow-hidden">
        {mode === "requesting" && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
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
                  Enable camera access for Shohaz in your browser settings, or enter the barcode below.
                </p>
              </div>
            </div>
          </div>
        )}

        {mode === "looking" && (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            {lookupError ? (
              <>
                <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border border-border bg-white p-8">
                  <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
                    <Icon name="danger" size={26} className="text-danger" />
                  </div>
                  <div>
                    <p className="text-item-title font-semibold text-ink">Couldn&apos;t look that up</p>
                    <p className="mt-1 text-body text-muted-foreground">{lookupError.message}</p>
                  </div>
                </div>
                <div className="flex w-full max-w-xs flex-col gap-2">
                  {lookupError.retryable && (
                    <button
                      type="button"
                      onClick={handleRetryLookup}
                      className="tap-target h-11 w-full rounded-full bg-ink text-body font-medium text-white"
                    >
                      Try again
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleRescan}
                    className="tap-target h-11 w-full rounded-full border border-border bg-white text-body font-medium text-ink"
                  >
                    Rescan
                  </button>
                </div>
              </>
            ) : (
              <>
                <Icon name="spinner" size={28} className="animate-spin text-ink" />
                <p className="text-body text-muted-foreground">Looking up this barcode…</p>
              </>
            )}
          </div>
        )}

        {mode === "scanning" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-x-6 top-6 rounded-xl bg-black/40 px-3 py-2 text-center text-caption text-white/90">
              Frame the barcode — usually printed on the packaging or a price sticker.
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-24 w-64 rounded-2xl border-2 border-yellow" />
            </div>
            {detectionSupport === "unavailable" && (
              <div className="absolute inset-x-0 bottom-0 bg-ink/90 px-6 py-4 text-center text-caption text-white/80">
                Automatic scanning isn&apos;t supported in this browser — enter the barcode below instead.
              </div>
            )}
          </>
        )}

        {(mode === "denied" || (mode === "scanning" && detectionSupport === "unavailable")) && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-6 pb-8 pt-4">
            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="Enter barcode number"
                inputMode="numeric"
                className={cn("h-11 flex-1", dark && "bg-white text-ink")}
              />
              <Button size="lg" onClick={() => handleResolve(manualCode)} disabled={!manualCode.trim()}>
                Go
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
