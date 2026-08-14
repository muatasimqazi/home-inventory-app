import type { MetadataRoute } from "next";

// Makes the app installable ("Add to Home Screen" on iOS, "Install app" on
// Android/desktop Chrome) — Next.js serves this at /manifest.webmanifest and
// injects the <link rel="manifest"> tag into every page automatically, no
// extra wiring needed. Icons match the brand mark used on the sign-in page
// and desktop sidebar (bg-yellow token, which is actually brand-500 taupe —
// see globals.css — behind lucide's "box" icon in white).
//
// This alone is enough for Android/desktop install prompts. iOS Safari's
// "Add to Home Screen" historically ignores manifest icons and reads
// <link rel="apple-touch-icon"> instead — that's set separately in
// layout.tsx's `icons.apple` / `appleWebApp` metadata.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Shohaz",
    short_name: "Shohaz",
    description: "Catalog, search, and locate everything in your home.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f6",
    theme_color: "#212121",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
