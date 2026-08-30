"use client";

import { Suspense, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { appOrigin } from "@/lib/urls";

type Mode = "request" | "sending" | "sent" | "resetting" | "updated";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const isRecovery = searchParams.get("type") === "recovery";
  const [mode, setMode] = useState<Mode>("request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(searchParams.get("error"));

  useAutoFocusVisible(emailInputRef, [isRecovery, mode]);
  useAutoFocusVisible(passwordInputRef, [isRecovery, mode]);

  async function sendResetEmail() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;

    setError(null);
    setMode("sending");
    const supabase = getSupabaseBrowserClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: `${appOrigin()}/auth/callback?next=/reset-password%3Ftype%3Drecovery`,
    });

    if (resetError) {
      setError(resetError.message);
      setMode("request");
      return;
    }

    setMode("sent");
  }

  async function updatePassword() {
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setMode("resetting");
    const supabase = getSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setMode("request");
      return;
    }

    setMode("updated");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="" width={56} height={56} className="size-14 rounded-2xl" />
          <p className="text-display font-semibold text-ink">Schuaz</p>
          <p className="text-body text-muted-foreground">{isRecovery ? "Choose a new password." : "Reset your password."}</p>
        </div>

        {mode === "sending" || mode === "resetting" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-ink">
            <Icon name="spinner" size={24} className="animate-spin" />
            <p className="text-body text-muted-foreground">{mode === "sending" ? "Sending reset link..." : "Updating password..."}</p>
          </div>
        ) : mode === "sent" ? (
          <div className="flex w-full flex-col items-center gap-3 text-center">
            <Icon name="bell" size={24} className="text-ink" />
            <p className="text-body font-medium text-ink">Check your email</p>
            <p className="text-caption text-muted-foreground">If an account exists for {email.trim()}, Supabase will send a password reset link.</p>
            <Button size="lg" variant="outline" onClick={() => router.push("/sign-in")}>
              Back to sign in
            </Button>
          </div>
        ) : mode === "updated" ? (
          <div className="flex w-full flex-col items-center gap-3 text-center">
            <Icon name="check" size={24} className="text-ink" />
            <p className="text-body font-medium text-ink">Password updated</p>
            <p className="text-caption text-muted-foreground">Use your new password the next time you sign in.</p>
            <Button size="lg" onClick={() => router.push("/")}>
              Continue
            </Button>
          </div>
        ) : isRecovery ? (
          <div className="flex w-full flex-col gap-3">
            <Input
              type="password"
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
              ref={passwordInputRef}
            />
            <Input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11"
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button size="lg" onClick={updatePassword} disabled={!password || !confirmPassword}>
              Update password
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
              ref={emailInputRef}
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button size="lg" onClick={sendResetEmail} disabled={!email.trim()}>
              Send reset link
            </Button>
            <button type="button" onClick={() => router.push("/sign-in")} className="text-caption text-muted-foreground">
              Back to sign in
            </button>
          </div>
        )}

        <p className="text-center text-micro text-muted-foreground">By continuing, you agree this is a demo build of Schuaz.</p>
      </div>
    </div>
  );
}
