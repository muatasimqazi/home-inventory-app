import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home Screen" on iOS, "Install app" on
// Android/desktop Chrome) — Next.js serves this at /manifest.webmanifest and
// injects the <link rel="manifest"> tag into every page automatically, no
// extra wiring needed.
//
// Icons are the real bundle (public/icons/, plus src/app/icon.svg and
// apple-icon.png as Next's auto-detected file-convention icons — see
// app-icons.md) — a house-with-magnifying-glass mark on teal (#0f6b68),
// not the placeholder box-icon-on-taupe one this file shipped with
// originally. Deliberately NOT adopting the bundle's own manifest.webmanifest
// wholesale, though — it was exported for a generically-named "Home
// Inventory" placeholder (different name/description, teal
// background_color/theme_color) rather than this app's actual identity, so
// name/description/colors below stay Shohaz's own (white/near-black,
// updated to the v3 sage/neutral palette — see the design-language
// reference) rather than switching the whole app's theme to match the
// icon art.
//
// This manifest alone is enough for Android/desktop install prompts. iOS
// Safari's "Add to Home Screen" historically ignores manifest icons and
// reads <link rel="apple-touch-icon"> instead — that comes from
// src/app/apple-icon.png (Next's file-convention icon, auto-detected, no
// manual metadata needed).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shohaz",
    short_name: "Shohaz",
    description: "Catalog, search, and locate everything in your home.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1a1d29",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
