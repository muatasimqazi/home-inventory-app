import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HydrationGate } from "@/components/hydration-gate";

export const metadata: Metadata = {
  title: "Shohaz",
  description: "Catalog, search, and locate everything in your home.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#212121",
  // Without this, iOS overlays the keyboard on top of fixed-position UI
  // (bottom sheets, dialogs) instead of shrinking the layout viewport —
  // "resizes-content" makes fixed elements reposition correctly above the
  // keyboard instead of being covered by it.
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <HydrationGate>{children}</HydrationGate>
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
      </body>
    </html>
  );
}
