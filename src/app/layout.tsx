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
        {/* Default 16px top offset lands inside the app's opaque sticky
            headers (~56-64px tall); push toasts below them instead. */}
        <Toaster position="top-center" offset={{ top: "calc(env(safe-area-inset-top) + 72px)" }} />
      </body>
    </html>
  );
}
