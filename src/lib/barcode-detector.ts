/**
 * BarcodeDetector isn't in the standard DOM lib types yet — same shim
 * src/app/scan/page.tsx and src/app/capture/barcode/page.tsx each used to
 * declare separately; centralized here now that ensureBarcodeDetector()
 * below is the one place responsible for making window.BarcodeDetector
 * exist in the first place.
 */
export interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

// No browser built on WebKit — which means every browser on iOS, Safari
// included, since Apple requires it (EU DMA carve-out aside, and even
// there no third-party engine has shipped Shape Detection support) — has
// ever implemented the Shape Detection API this reads off of. Chromium
// (desktop and Android) is the only real native implementation. Without
// this, /scan and /capture/barcode's "automatic scanning isn't supported
// in this browser" fallback was, in practice, "isn't supported on iOS,"
// full stop — manual code entry only, on the platform this app's own
// install story (appleWebApp in src/app/layout.tsx) most leans on.
//
// barcode-detector (github.com/Sec-ant/barcode-detector) polyfills the
// exact same class shape — same constructor options, same detect()
// signature and format-string vocabulary ("ean_13", "qr_code", ...) — on
// top of zxing-wasm, a WebAssembly build of ZXing-C++. WASM itself has
// been supported in Safari since iOS 11; this is purely filling a gap in
// which *JS APIs* WebKit chooses to expose over it, not a platform
// capability gap.
let loadPromise: Promise<boolean> | null = null;

/**
 * Ensures window.BarcodeDetector exists, one way or another — resolves
 * true once it's safe to `new window.BarcodeDetector(...)`, false if it
 * genuinely couldn't be made to exist (the polyfill's own WASM
 * instantiation failing — not expected in practice, but network-fetched
 * WebAssembly is one more thing that can fail than a built-in API is).
 * Single-flight and memoized: every caller across the app (both capture
 * routes today) shares one load instead of each racing to import the
 * polyfill separately.
 *
 * A real native implementation is left completely alone — the polyfill
 * package only ever assigns window.BarcodeDetector when it's absent, so
 * this resolves synchronously-fast (true, no import) on every browser
 * that already has one.
 */
export function ensureBarcodeDetector(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if ("BarcodeDetector" in window) return Promise.resolve(true);
  if (!loadPromise) {
    loadPromise = import("barcode-detector/ponyfill")
      .then(({ BarcodeDetector, prepareZXingModule }) => {
        // Self-hosted, not the package's own jsDelivr-CDN default — this
        // app has no CSP that would block a third-party fetch, but a core
        // capture flow silently depending on a third-party CDN being up
        // (and reachable — some regions/networks block jsDelivr outright)
        // isn't a trade worth making for what's otherwise a same-origin
        // static asset. barcode-detector pins zxing-wasm to an exact
        // version in its own package.json (not a range), so the vendored
        // binary at public/wasm/zxing_reader.wasm only needs re-copying
        // when the barcode-detector dependency itself is bumped — see
        // public/wasm/README.md for the copy command.
        prepareZXingModule({
          overrides: {
            locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? `/wasm/${path}` : prefix + path),
          },
        });
        // The package's own BarcodeDetector type is stricter than this
        // file's BarcodeDetectorLike shim (an exact format-string union vs.
        // our plain string[], matching how the not-yet-standard DOM type
        // would eventually look) — both BARCODE_FORMATS call sites already
        // only ever pass values from that same real vocabulary (confirmed
        // against the package's supported-formats list), so this is a
        // widening cast, not a behavioral one.
        window.BarcodeDetector = BarcodeDetector as unknown as Window["BarcodeDetector"];
        return true;
      })
      .catch((err) => {
        console.error("Couldn't load the barcode-detector polyfill:", err);
        return false;
      });
  }
  return loadPromise;
}
