"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { App, type URLOpenListenerEvent } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

// Must match capacitor.config.ts's appId (also strings.xml's
// custom_url_scheme, auto-set to the same value by `cap add android`) —
// not imported from there since nothing else in src/ pulls from that
// CLI-only config file, so a plain constant with this comment is the
// simplest way to keep the two in sync by hand.
const AUTH_CALLBACK_URL = "com.schuaz.app://auth/callback";

/**
 * Completes Google sign-in inside the native app (docs/Mobile App
 * Addendum.md) — this is the fix for "login opens Chrome and after
 * login stays in the web version." Google's OAuth pages refuse to
 * render inside an embedded WebView at all (a long-standing anti-
 * phishing policy on Google's end, not a bug in this app), so
 * sign-in/page.tsx's continueWithGoogle() opens the flow in an in-app
 * browser tab instead (Browser.open() — Chrome Custom Tabs under the
 * hood, a real system-browser UI Google's check accepts, not the app's
 * own WebView) rather than a same-window redirect. Without this
 * listener, that flow had nothing telling it to hand control back to
 * the app once Google finished — the user just stayed in that browser
 * tab, now signed in on the *website*, with the native app still
 * sitting on its sign-in screen underneath.
 *
 * The fix: point that flow's redirect at this app's own custom URL
 * scheme instead of a real https:// URL. Android's intent-filter for
 * that scheme (AndroidManifest.xml) routes it straight back into this
 * app instead of leaving it in the browser tab — but there are two
 * distinct ways that delivery can happen, and a real device needs both:
 *
 * - Warm: the app was still running in the background the whole time
 *   the Custom Tab was open. Android delivers the callback as a new
 *   intent to the already-running activity, firing the `appUrlOpen`
 *   event below.
 * - Cold: Android reclaimed the backgrounded app while the user was off
 *   signing in (real, common on a real device with limited RAM — an
 *   emulator with more free memory can mask this entirely, which is
 *   exactly what happened testing this: it worked there and not on a
 *   real phone). The callback intent then has to *launch a fresh
 *   process*, and `appUrlOpen` never fires for it — nothing's listening
 *   yet by the time it would. `App.getLaunchUrl()` exists specifically
 *   for this: it hands back the URL a cold start was launched with, so
 *   it's checked once on mount alongside the live listener.
 *
 * Either way, from there it's the same PKCE code-exchange
 * /auth/callback/route.ts already does server-side for the web flow,
 * just run client-side here since the deep link lands directly in the
 * WebView's JS context, never touching that route. The PKCE code
 * verifier itself survives a cold restart fine — it's in a real cookie
 * (getSupabaseBrowserClient uses @supabase/ssr's cookie-backed storage,
 * not in-memory JS state), backed by the WebView's persistent cookie
 * jar for this origin, not the killed process.
 *
 * Mounted once at the root layout (not on sign-in/page.tsx itself) —
 * same "always mounted regardless of what page is showing" reasoning as
 * PointerEventsWatchdog/PhotoLightbox living there, doubly true now that
 * a cold-start callback can land before sign-in's own page has even
 * rendered.
 *
 * A no-op everywhere except the native app — Capacitor.isNativePlatform()
 * is false in every browser/PWA context, including this exact code
 * running there, so the existing web OAuth path (sign-in/page.tsx's own
 * redirectTo, /auth/callback/route.ts) is untouched and handles that
 * case entirely server-side, same as before this component existed.
 */
export function NativeAuthDeepLinkListener() {
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    async function handleUrl(rawUrl: string) {
      // Checked against the raw string, not a parsed URL's `origin` —
      // `origin` is spec'd as opaque ("null") for non-http(s) schemes
      // like this custom one, so it can't be compared the normal way.
      // `searchParams` below still works fine regardless — query-string
      // parsing isn't origin-dependent.
      if (!rawUrl.startsWith(AUTH_CALLBACK_URL)) return;
      let url: URL;
      try {
        url = new URL(rawUrl);
      } catch {
        return;
      }

      // Dismiss the Custom Tab first — the exchange below can take a
      // moment, and there's no reason to leave it sitting on top while
      // it runs. A no-op (caught, ignored) on a cold start, where
      // there's no Custom Tab left to close — Android already tore it
      // down along with the old process.
      await Browser.close().catch(() => {});

      const code = url.searchParams.get("code");
      if (!code) return;

      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        router.push(`/sign-in?error=${encodeURIComponent(error.message)}`);
        return;
      }
      router.push(url.searchParams.get("next") ?? "/dashboard");
    }

    const handle = App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
      handleUrl(event.url);
    });

    // Cold-start case — see this component's own top comment.
    App.getLaunchUrl().then((launch) => {
      if (launch?.url) handleUrl(launch.url);
    });

    return () => {
      handle.then((h) => h.remove());
    };
  }, [router]);

  return null;
}
