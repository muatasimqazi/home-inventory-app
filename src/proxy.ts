import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth as a gate: every route except /sign-in and the OAuth callback
// requires a real Supabase session. /api/v1/webhooks/* is the one
// deliberate exception beyond that — a webhook (Resend calling in on a
// received email, e.g.) has no user session to present at all; those
// routes authenticate the request themselves via a cryptographic
// signature check (Svix/webhookSecret), not a Supabase session, so they'd
// otherwise get redirected to /sign-in before ever reaching route code.
const PUBLIC_PATHS = ["/sign-in", "/auth/callback", "/api/v1/webhooks"];

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

  if (user && pathname === "/sign-in") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  // manifest.webmanifest excluded alongside favicon.ico — browsers (and
  // iOS's "Add to Home Screen") need to fetch it to decide whether the app
  // is installable *before* there's necessarily an authenticated session,
  // so gating it here would silently make the app un-installable while
  // signed out (confirmed live: an unauthed request came back a 307 to
  // /sign-in instead of the manifest JSON).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
