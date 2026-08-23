"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { useBarcodeDetectorSupport } from "@/hooks/use-barcode-detector-support";
import { cn } from "@/lib/utils";

type Mode = "requesting" | "scanning" | "denied" | "not-found";

export default function QrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containers = useInventoryStore((s) => s.containers);

  const [mode, setMode] = useState<Mode>("requesting");
  const [manualCode, setManualCode] = useState("");
  const detectionSupport = useBarcodeDetectorSupport();

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
        setMode("scanning");
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

  useEffect(() => {
    if (mode !== "scanning" || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;

    // "checking" (still loading the WASM polyfill on a browser without a
    // native BarcodeDetector — every iOS browser) falls through to here
    // too: this effect just doesn't start yet, and re-runs once
    // detectionSupport flips to "ready" or "unavailable" (both are deps
    // below). The video keeps playing either way — there's just nothing
    // reading frames off it until detection is actually ready.
    if (detectionSupport !== "ready" || !window.BarcodeDetector) return;
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
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

  function handleResolve(rawValue: string) {
    const token = rawValue.split("/").pop()?.trim().toUpperCase() ?? "";
    const container = containers.find((c) => c.tagToken.toUpperCase() === token);
    if (container) {
      router.push(`/containers/${container.id}`);
    } else {
      setMode("not-found");
    }
  }

  const dark = mode === "scanning";

  return (
    <div className={cn("fixed inset-0 z-50 flex flex-col", dark ? "bg-ink text-white" : "bg-background text-ink")}>
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close scanner"
          className={cn(
            "tap-target flex size-10 items-center justify-center rounded-full",
            dark ? "bg-white/10" : "bg-white shadow-sm"
          )}
        >
          <Icon name="close" size={20} />
        </button>
        <span className="text-caption font-medium">Scan a Container label</span>
        <div className="size-10" />
      </header>

      <div className="relative flex-1">
        {mode === "requesting" && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <Icon name="spinner" size={28} className="animate-spin" />
            <p className="text-body text-muted-foreground">Requesting camera access…</p>
          </div>
        )}

        {mode === "scanning" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 rounded-2xl border-2 border-yellow" />
            </div>
            {detectionSupport === "unavailable" && (
              <div className="absolute inset-x-0 bottom-0 bg-ink/90 px-6 py-4 text-center text-caption text-white/80">
                Automatic scanning isn&apos;t supported in this browser — enter the code below instead.
              </div>
            )}
          </>
        )}

        {(mode === "denied" || mode === "not-found" || detectionSupport === "unavailable") && mode !== "requesting" && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 px-6 pb-8 pt-4">
            {mode === "denied" && <p className="text-center text-body text-muted-foreground">Camera access is off. Enter the label code manually.</p>}
            {mode === "not-found" && <p className="text-center text-body text-danger">No container matches that code.</p>}
            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="SHZ-XXXXXXXX"
                className="h-11 flex-1"
              />
              <Button size="lg" onClick={() => handleResolve(manualCode)}>
                Go
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
