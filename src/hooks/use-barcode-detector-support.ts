import { useEffect, useState } from "react";
import { ensureBarcodeDetector } from "@/lib/barcode-detector";

export type BarcodeDetectorSupport = "checking" | "ready" | "unavailable";

/**
 * Resolves whether `new window.BarcodeDetector(...)` is safe to call yet —
 * shared by /scan and /capture/barcode, the app's two live-detection
 * routes, so both go through ensureBarcodeDetector()'s single-flight load
 * instead of each racing their own.
 *
 * Deliberately three states, not a boolean: on a browser missing the
 * native API (every iOS browser), the polyfill's WASM load is async, so
 * there's a real window where "not ready yet" and "never going to be
 * ready" look identical from a synchronous `"BarcodeDetector" in window`
 * check — a page that used that as its "show the unsupported-browser
 * fallback" condition would flash the manual-entry banner on iOS for the
 * split second before the polyfill finishes loading. "checking" is that
 * gap: render the camera and nothing else, same as while waiting on
 * camera permission, and only fall back to manual entry once the answer
 * is actually "unavailable."
 */
export function useBarcodeDetectorSupport(): BarcodeDetectorSupport {
  const [support, setSupport] = useState<BarcodeDetectorSupport>("checking");

  useEffect(() => {
    let cancelled = false;
    ensureBarcodeDetector().then((ok) => {
      if (!cancelled) setSupport(ok ? "ready" : "unavailable");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return support;
}
