"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { appOrigin } from "@/lib/urls";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

// Must match native-auth-deep-link-listener.tsx's own copy of this same
// constant (see that file's comment on why it isn't shared via import).
const NATIVE_AUTH_CALLBACK_URL = "com.schuaz.app://auth/callback";

type Mode = "default" | "email" | "authenticating" | "checkEmail";
type AuthAction = "signin" | "signup";

export default function SignInPage() {
  return (
    <Suspense>
      <SignInInner />
    </Suspense>
  );
}

function SignInInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("default");
  const emailInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(emailInputRef, [mode]);
  const [authAction, setAuthAction] = useState<AuthAction>(searchParams.get("action") === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  async function continueWithGoogle() {
    setError(null);
    setMode("authenticating");
    const supabase = getSupabaseBrowserClient();
    // Carries the same ?next= destination the password path already
    // respects (line ~80) through Google's own external redirect —
    // without this, an OAuth sign-in coming from a scanned NFC/QR link
    // (or any other deep link) would land wherever /auth/callback's own
    // fallback points instead of back where the user actually came from.
    const next = searchParams.get("next") ?? "/dashboard";

    // Native app: Google's OAuth pages refuse to render inside an
    // embedded WebView at all (a Google-side anti-phishing policy, see
    // native-auth-deep-link-listener.tsx's own comment) — skipBrowserRedirect
    // gets the authorize URL back instead of Supabase auto-navigating the
    // WebView itself, then Browser.open() shows it in a real Custom Tab
    // Google's check accepts. redirectTo is this app's own custom scheme,
    // not a real https:// URL — that listener component is what actually
    // completes the sign-in once Google redirects back to it.
    if (Capacitor.isNativePlatform()) {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${NATIVE_AUTH_CALLBACK_URL}?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
      });
      if (oauthError || !data.url) {
        setError(oauthError?.message ?? "Couldn't start sign-in.");
        setMode("default");
        return;
      }
      await Browser.open({ url: data.url });
      return;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    // On success the browser navigates away to Google — this only returns
    // if the redirect itself failed to start.
    if (oauthError) {
      setError(oauthError.message);
      setMode("default");
    }
  }

  // Mirrors continueWithGoogle() exactly (same skipBrowserRedirect +
  // Browser.open() pattern, same native-scheme redirectTo) — the only
  // difference is provider: "apple". Apple's own HIG "recommends" the
  // native AuthenticationServices sheet over a web redirect when
  // available, but doesn't require it — Guideline 4.8 only requires
  // offering an equivalent option, which this satisfies the same way
  // Google already does, reusing infrastructure (NativeAuthDeepLinkListener,
  // the redirectTo callback route) already proven working rather than
  // adding a second, native-only plugin/flow.
  async function continueWithApple() {
    setError(null);
    setMode("authenticating");
    const supabase = getSupabaseBrowserClient();
    const next = searchParams.get("next") ?? "/dashboard";

    if (Capacitor.isNativePlatform()) {
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: `${NATIVE_AUTH_CALLBACK_URL}?next=${encodeURIComponent(next)}`, skipBrowserRedirect: true },
      });
      if (oauthError || !data.url) {
        setError(oauthError?.message ?? "Couldn't start sign-in.");
        setMode("default");
        return;
      }
      await Browser.open({ url: data.url });
      return;
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: `${appOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setMode("default");
    }
  }

  async function submitEmailForm() {
    setError(null);
    setMode("authenticating");
    const supabase = getSupabaseBrowserClient();

    if (authAction === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password });
      if (signUpError) {
        setError(signUpError.message);
        setMode("email");
        return;
      }
      if (!data.session) {
        // Email confirmation is required — no session yet.
        setMode("checkEmail");
        return;
      }
      router.push("/household-setup");
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) {
      setError(signInError.message);
      setMode("email");
      return;
    }
    // Sends the user back to wherever the proxy intercepted them from
    // (e.g. a scanned NFC/QR link at /c/[token]) instead of always "/".
    router.push(searchParams.get("next") ?? "/dashboard");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-10">
      <div className="flex w-full max-w-sm flex-1 flex-col justify-center gap-8">
        {mode === "default" && (
          <div className="flex flex-col items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={56} height={56} className="size-14 rounded-2xl" />
            <p className="text-micro font-semibold tracking-wide text-yellow-text uppercase">One place for household life</p>
            <h1 className="text-display font-semibold text-ink">Just ask your home.</h1>
            <p className="text-body text-muted-foreground">Find anything you own, in seconds.</p>
          </div>
        )}

        {/* Abstract "storage bins" illustration, default mode only — same
            role the reference design's hero graphic plays, redrawn with
            this app's own sage/ink tokens (globals.css's v3 palette)
            rather than lifted colors from that reference. */}
        {mode === "default" && (
          <div className="flex items-center justify-center rounded-3xl bg-surface-muted py-10">
            <svg width="140" height="96" viewBox="0 0 140 96" fill="none" aria-hidden="true">
              <rect x="4" y="28" width="36" height="30" rx="8" className="fill-brand-200" />
              <rect x="52" y="28" width="36" height="30" rx="8" className="fill-brand-200" />
              <rect x="100" y="28" width="36" height="30" rx="8" className="fill-yellow" />
              <rect x="28" y="62" width="36" height="30" rx="8" className="fill-ink-fill" />
              <rect x="76" y="62" width="36" height="30" rx="8" className="fill-brand-200" />
            </svg>
          </div>
        )}

        {mode === "authenticating" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-ink">
            <Icon name="spinner" size={24} className="animate-spin" />
            <p className="text-body text-muted-foreground">Signing in…</p>
          </div>
        ) : mode === "checkEmail" ? (
          <div className="flex w-full flex-col items-center gap-3 text-center">
            <Icon name="bell" size={24} className="text-ink" />
            <p className="text-body font-medium text-ink">Check your email</p>
            <p className="text-caption text-muted-foreground">
              We sent a confirmation link to {email.trim()}. Click it, then come back and sign in.
            </p>
            <button
              type="button"
              onClick={() => {
                setMode("email");
                setAuthAction("signin");
              }}
              className="text-caption text-muted-foreground underline underline-offset-2"
            >
              Back to sign in
            </button>
          </div>
        ) : mode === "email" ? (
          <div className="flex w-full flex-col gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              ref={emailInputRef}
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button size="lg" onClick={submitEmailForm} disabled={!email || !password}>
              {authAction === "signup" ? "Create account" : "Continue"}
            </Button>
            {authAction === "signin" && (
              <button type="button" onClick={() => router.push("/reset-password")} className="text-caption text-muted-foreground">
                Forgot password?
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setAuthAction((a) => (a === "signup" ? "signin" : "signup"));
                setError(null);
              }}
              className="text-caption text-muted-foreground"
            >
              {authAction === "signup" ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("default");
                setError(null);
              }}
              className="text-caption text-muted-foreground"
            >
              Back
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            {error && <p className="text-center text-caption text-danger">{error}</p>}
            {/* Create account / Log in as distinct primary entry points
                (were a single "Continue with email" before) — both land
                on the same email-mode form below, differing only in
                authAction, same as toggling it there always did. */}
            <Button
              size="lg"
              className="bg-ink-fill text-white hover:bg-ink-fill/90"
              onClick={() => {
                setAuthAction("signup");
                setMode("email");
              }}
            >
              Create account
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setAuthAction("signin");
                setMode("email");
              }}
            >
              Log in
            </Button>
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-micro text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>
            <Button size="lg" variant="outline" onClick={continueWithGoogle}>
              Continue with Google
            </Button>
            <Button size="lg" variant="outline" className="bg-black text-white hover:bg-black/90" onClick={continueWithApple}>
              Continue with Apple
            </Button>
          </div>
        )}

        <p className="text-center text-micro text-muted-foreground">
          By continuing, you agree to Schuaz&apos;s{" "}
          <Link href="/terms" className="underline underline-offset-2">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
