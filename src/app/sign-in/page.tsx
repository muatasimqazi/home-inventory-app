"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { appOrigin } from "@/lib/urls";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={56} height={56} className="size-14 rounded-2xl" />
          <p className="text-display font-semibold text-ink">Schuaz</p>
          <p className="text-body text-muted-foreground">Find anything you own, in seconds.</p>
        </div>

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
            <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={continueWithGoogle}>
              Continue with Google
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => {
                setMode("email");
                setAuthAction("signin");
              }}
            >
              Continue with email
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
