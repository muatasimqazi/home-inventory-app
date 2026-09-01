import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth as a gate: every route except /sign-in and the OAuth callback
// requires a real Supabase session. /api/v1/webhooks/* is the one
// deliberate exception beyond that — a webhook (Resend calling in on a
// received email, e.g.) has no user session to present at all; those
// routes authenticate the request themselves via a cryptographic
// signature check (Svix/webhookSecret), not a Supabase session, so they'd
// otherwise get redirected to /sign-in before ever reaching route code.
// /api/v1/plaid/sync-all and /api/v1/push/send-due-bills are the same
// shape for the same reason: Vercel's cron scheduler calls them with a
// `CRON_SECRET` bearer token, not a browser session — confirmed live in
// production (for the Plaid case) that omitting this meant the nightly
// job silently 307'd to /sign-in before the route's own CRON_SECRET check
// ever ran, i.e. the cron fallback never actually fired. Applying that
// lesson to the push job's route up front rather than rediscovering it.
// /api/v1/public/* (Settings > API Keys) is the same shape again: Home
// Assistant/Shortcuts authenticate with `Authorization: Bearer shz_...`
// (see requireApiKey), never a browser session — caught this one in a
// local smoke test *before* shipping it broken, unlike the Plaid case,
// which had to learn it live in production first.
// /api/v1/push/send-capture-nudges and /api/v1/push/send-debt-payments-
// due-today are the same CRON_SECRET-bearer shape as send-due-bills right
// above — send-capture-nudges was *already* a live instance of exactly
// this bug (a real, shipped cron job silently 307'ing to /sign-in on
// every run, found while adding the debt-payment job below and checking
// this list for what else might be missing from it) rather than a new one
// introduced here.
// /api/v1/push/send-low-stock-alerts is the same shape again — added
// here up front alongside vercel.json's own cron entry this time, not
// discovered after the fact.
//
// This list has bitten a new CRON_SECRET-bearer route often enough
// (three separate times before this comment existed) that it's worth
// naming as its own lesson: adding a route like that means adding it
// here too, or it silently 307s to /sign-in before its own auth check
// (or any of its logic) ever runs — CRON_SECRET, Vercel's own SSO/
// deployment protection, and everything else about the route can be
// completely correct and it'll still never fire.
const PUBLIC_PATHS = [
  "/",
  "/sign-in",
  "/reset-password",
  "/privacy",
  "/terms",
  "/contact",
  "/auth/callback",
  "/api/v1/webhooks",
  "/api/v1/plaid/sync-all",
  "/api/v1/push/send-due-bills",
  "/api/v1/push/send-capture-nudges",
  "/api/v1/push/send-debt-payments-due-today",
  "/api/v1/push/send-low-stock-alerts",
  "/api/v1/public",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    // Misconfigured env — fail open rather than lock the whole app out;
    // the pages themselves still work against the mock store either way.
    return response;
  }

  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() (not getSession()) validates the token against Supabase
  // rather than trusting whatever's in the cookie — the point of doing
  // this in middleware at all.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  if (!user && !isPublicPath) {
    const redirectUrl = new URL("/sign-in", request.url);
    // Preserve where they were headed (e.g. a scanned NFC/QR link at
    // /c/[token]) so sign-in can send them there instead of just "/".
    redirectUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (pathname === "/" || pathname === "/sign-in")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  // manifest.webmanifest excluded alongside favicon.ico — browsers (and
  // iOS's "Add to Home Screen") need to fetch it to decide whether the app
  // is installable *before* there's necessarily an authenticated session,
  // so gating it here would silently make the app un-installable while
  // signed out (confirmed live: an unauthed request came back a 307 to
  // /sign-in instead of the manifest JSON). sw.js needs the same
  // exclusion for the same reason — service worker registration is a
  // plain same-origin fetch, and while a signed-in user's browser sends
  // its session cookie along fine, the script itself has no reason to be
  // gated behind auth at all (it's a static asset, not user data), so it
  // shouldn't depend on that timing working out. Caught this one before
  // it shipped broken, unlike the manifest case above.
  //
  // .wasm is the same shape again, caught the same way (a local smoke
  // test — curling /wasm/zxing_reader.wasm unauthenticated came back a
  // 307 instead of the binary) before it shipped broken: the
  // barcode-detector polyfill (src/lib/barcode-detector.ts) fetches
  // public/wasm/zxing_reader.wasm as a plain same-origin request too, and
  // it's the same "static asset, not user data" case as sw.js.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw\\.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wasm)$).*)"],
};
