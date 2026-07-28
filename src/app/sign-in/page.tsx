"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { appOrigin } from "@/lib/urls";

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
  const [authAction, setAuthAction] = useState<AuthAction>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  async function continueWithGoogle() {
    setError(null);
    setMode("authenticating");
    const supabase = getSupabaseBrowserClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${appOrigin()}/auth/callback` },
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
    router.push(searchParams.get("next") ?? "/");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-yellow">
            <Icon name="box" size={26} className="text-white" />
          </div>
          <p className="text-display font-semibold text-ink">Shohaz</p>
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
              autoFocus
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
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={continueWithGoogle}>
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

        <p className="text-center text-micro text-muted-foreground">By continuing, you agree this is a demo build of Shohaz.</p>
      </div>
    </div>
  );
}
