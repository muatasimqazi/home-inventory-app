import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HydrationGate } from "@/components/hydration-gate";
import { DomainGate } from "@/components/domain-gate";
import { PhotoLightbox } from "@/components/photo-lightbox";
import { PointerEventsWatchdog } from "@/components/pointer-events-watchdog";
import { NativeAuthDeepLinkListener } from "@/components/native-auth-deep-link-listener";
import { NativePushNotificationListener } from "@/components/native-push-notification-listener";
import { NativeSplashScreen } from "@/components/native-splash-screen";
import { CommandKShortcut } from "@/components/command-k-shortcut";
import { PHProvider } from "@/components/posthog-provider";

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
  // Matches whichever theme is actually active (see ThemeProvider below) —
  // light keeps the app's white page background, dark matches
  // globals.css's .dark --color-background.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#12141a" },
  ],
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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        {/* Wraps everything — a plain context provider (no DOM output of
            its own), so usePostHog() and the module-level posthog.init()
            in posthog-provider.tsx are available to every descendant,
            including lib/store.ts's hydrate() (real user known -> identify)
            and the sign-out handlers (reset()). See that file's own
            comment for why init happens at module load, not a useEffect
            here. */}
        <PHProvider>
          {/* attribute="class" toggles the .dark class this app's own
              @custom-variant dark selector (globals.css) reads; "system"
              resolves prefers-color-scheme into a real class for us, so no
              separate media-query branch is needed anywhere else. Persists
              the user's choice to localStorage itself — see the Settings
              page's Light/Dark/System control for the write side.
              suppressHydrationWarning above is next-themes' own documented
              requirement: it sets the class on <html> before React hydrates,
              which would otherwise mismatch the server-rendered markup. */}
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
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
            {/* Outside HydrationGate/DomainGate on purpose — it needs to run
                (and be able to unstick the page) even if one of those is
                itself the thing showing, not just once the real app content
                has mounted. See its own file for what bug this guards
                against ("sometimes doesn't let you click stuff", app-wide). */}
            <PointerEventsWatchdog />
            {/* Native-app-only — hides the branded launch screen once
                real content has actually mounted here, not the instant
                the WebView is created (see its own file for the blank-
                white-flash gap this closes, and capacitor.config.ts's
                launchAutoHide: false alongside it). Mounted first, ahead
                of the other native-only listeners below, so nothing
                delays this past whenever the rest of the tree is ready. */}
            <NativeSplashScreen />
            {/* Native-app-only (no-op in a browser/PWA) — completes Google
                sign-in's round trip through the in-app browser tab. See
                its own file for the "login opens Chrome and stays there"
                bug this fixes. */}
            <NativeAuthDeepLinkListener />
            {/* Native-app-only — registration, notification taps, and
                foreground receipt, kept working no matter what page the
                app is on (see its own file for why this has to be global
                rather than living in Settings > Notifications' hook). */}
            <NativePushNotificationListener />
            {/* Cmd/Ctrl+K -> Search — a hardware-keyboard shortcut, so this
                is harmless (just never fires) on native/touch. */}
            <CommandKShortcut />
          </ThemeProvider>
        </PHProvider>
      </body>
    </html>
  );
}
