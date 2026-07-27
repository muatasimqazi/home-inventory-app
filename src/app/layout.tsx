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
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
