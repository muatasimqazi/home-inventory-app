"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";

type Mode = "requesting" | "scanning" | "denied" | "not-found";

// BarcodeDetector isn't in the standard DOM lib types yet.
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export default function QrScannerPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containers = useInventoryStore((s) => s.containers);

  const [mode, setMode] = useState<Mode>("requesting");
  const [manualCode, setManualCode] = useState("");
  const supportsDetection = typeof window !== "undefined" && "BarcodeDetector" in window;

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

    if (!supportsDetection || !window.BarcodeDetector) return;
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
  }, [mode]);

  function handleResolve(rawValue: string) {
    const token = rawValue.split("/").pop()?.trim().toUpperCase() ?? "";
    const container = containers.find((c) => c.tagToken.toUpperCase() === token);
    if (container) {
      router.push(`/containers/${container.id}`);
    } else {
      setMode("not-found");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink text-white">
      <header className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Close scanner"
          className="tap-target flex size-10 items-center justify-center rounded-full bg-white/10"
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
            <p className="text-body">Requesting camera access…</p>
          </div>
        )}

        {mode === "scanning" && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="size-56 rounded-2xl border-2 border-yellow" />
            </div>
            {!supportsDetection && (
              <div className="absolute inset-x-0 bottom-0 bg-ink/90 px-6 py-4 text-center text-caption text-white/80">
                Automatic scanning isn&apos;t supported in this browser — enter the code below instead.
              </div>
            )}
          </>
        )}

        {(mode === "denied" || mode === "not-found" || !supportsDetection) && mode !== "requesting" && (
          <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-ink px-6 pb-8 pt-4">
            {mode === "denied" && <p className="text-center text-body text-white/70">Camera access is off. Enter the label code manually.</p>}
            {mode === "not-found" && <p className="text-center text-body text-danger">No container matches that code.</p>}
            <div className="flex gap-2">
              <Input
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder="SHZ-XXXXXXXX"
                className="h-11 flex-1 border-white/20 bg-white/10 text-white placeholder:text-white/40"
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
