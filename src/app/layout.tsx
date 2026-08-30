import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HydrationGate } from "@/components/hydration-gate";
import { DomainGate } from "@/components/domain-gate";
import { PhotoLightbox } from "@/components/photo-lightbox";

export const metadata: Metadata = {
  title: "Schuaz",
  description: "Catalog, search, and locate everything in your home.",
  // favicon.ico, icon.svg, and apple-icon.png in this same app/ directory
  // are Next's file-convention icons (see app-icons.md), auto-detected and
  // auto-linked into <head>. The explicit apple-touch-icon below points at
  // the legacy root URL iOS/Safari web clips commonly probe and cache
  // separately from Next's generated /apple-icon route.
  icons: {
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  //
  // Standalone/"installed" mode still needs its own config though — iOS
  // reads appleWebApp separately from either icon source to decide how the
  // app *behaves* once added to the home screen via Safari's Share sheet.
  // `capable: true` drops the Safari chrome (address bar, tab bar) entirely;
  // without it "Add to Home Screen" just opens a normal tab.
  appleWebApp: {
    capable: true,
    title: "Schuaz",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1a1d29", // v3 palette — near-black ink, was v2's warm-toned #212121
  // Helps Chromium (Android) reposition fixed UI above the keyboard, but
  // Safari/iOS has never implemented interactive-widget, so this alone does
  // nothing there — the real cross-browser fix is useKeyboardInset (see
  // src/hooks/use-keyboard-inset.ts), wired into the bottom sheet itself.
  interactiveWidget: "resizes-content",
  // Required for env(safe-area-inset-*) to resolve to anything but 0 —
  // without it, appleWebApp's black-translucent status bar (see metadata
  // above) overlays content with no way to detect how far to pad below it.
  // The app already relies on safe-area-inset-top elsewhere (e.g. the
  // Toaster offset below), so this was silently a no-op in standalone mode
  // until now.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <HydrationGate>
          <DomainGate>{children}</DomainGate>
        </HydrationGate>
        {/* Default 16px top offset lands inside the app's back-button/header
            row (~56-64px tall); push toasts below it instead. Sonner uses a
            *separate* mobileOffset (not offset) below a 600px viewport, so
            both must be set identically or phones silently fall back to the
            unoffset default — this app is viewed almost exclusively on phones. */}
        <Toaster
          position="top-center"
          offset={{ top: "calc(env(safe-area-inset-top) + 72px)" }}
          mobileOffset={{ top: "calc(env(safe-area-inset-top) + 72px)" }}
        />
        {/* One instance for the whole app — any component opens it via
            useLightboxStore().openLightbox(...), no per-page wiring. */}
        <PhotoLightbox />
      </body>
    </html>
  );
}
