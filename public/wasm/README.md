# Vendored WASM

`zxing_reader.wasm` is the reader-only ZXing-C++ WebAssembly build that the
`barcode-detector` polyfill (src/lib/barcode-detector.ts) instantiates for
browsers without a native `window.BarcodeDetector` — every browser on iOS,
in practice. Self-hosted here instead of the package's own jsDelivr-CDN
default so the barcode-scan flows (/scan, /capture/barcode) don't depend on
a third-party host being reachable.

`barcode-detector` pins its `zxing-wasm` dependency to an exact version (no
range) in its own `package.json`, so this file only goes stale when the
`barcode-detector` version in this repo's `package.json` changes. When it
does, re-copy from the freshly installed package:

```sh
pnpm install
cp "$(find node_modules/.pnpm -maxdepth 1 -iname 'zxing-wasm*')/node_modules/zxing-wasm/dist/reader/zxing_reader.wasm" public/wasm/zxing_reader.wasm
```

(`find` rather than a fixed path — pnpm's store directory name is
version-suffixed, e.g. `zxing-wasm@3.1.3_@types+emscripten@1.41.5`.)
