"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

const MIN_PASSWORD_LENGTH = 6;

/**
 * The proactive, signed-in counterpart to reset-password/page.tsx's email
 * link flow — that page is "forgot password" (signed out, no session to
 * act on yet); this one is "I know my password and just want to change
 * it" (or, for a Google-only account, "I want to add one"), reachable
 * directly from Settings without leaving the app or waiting on email.
 *
 * Two real modes, not one — an account signed in only via Google has no
 * existing password to verify, so there's nothing to put in a "current
 * password" field; supabase.auth.updateUser({ password }) alone both
 * changes an existing password *and* is how a Google-only account gains
 * password sign-in for the first time (useful for the native app in
 * particular — password sign-in works directly in the WebView, unlike
 * Google's OAuth pages, which refuse to render there at all and need the
 * Custom Tab detour in sign-in/page.tsx). Which mode applies is read off
 * the real session's own identities array, not guessed.
 */
export default function ChangePasswordPage() {
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState<boolean | "loading">("loading");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useAutoFocusVisible(firstInputRef, [hasPassword]);

  useEffect(() => {
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        setHasPassword((data.user?.identities ?? []).some((identity) => identity.provider === "email"));
      });
  }, []);

  async function handleSubmit() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setError(null);
    setSaving(true);
    const supabase = getSupabaseBrowserClient();
    // current_password is real, current-Supabase verification that the
    // caller actually knows the old password before a new one takes
    // effect — omitted entirely in the "set" case (hasPassword === false)
    // since there's no existing password for the server to check it
    // against.
    const { error: updateError } = await supabase.auth.updateUser(
      hasPassword ? { password: newPassword, current_password: currentPassword } : { password: newPassword }
    );
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-desktop-title font-semibold text-ink">{hasPassword === true ? "Change password" : "Password"}</h1>
          <p className="mt-0.5 text-body text-muted-foreground">
            {hasPassword === false ? "Add a password so you can also sign in without Google." : "Update the password you sign in with."}
          </p>
        </div>
      </div>

      {hasPassword === "loading" ? (
        <div className="flex justify-center py-10">
          <Icon name="spinner" size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : done ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <Icon name="check" size={24} className="text-ink" />
          <p className="text-body font-medium text-ink">{hasPassword ? "Password updated" : "Password added"}</p>
          <p className="text-caption text-muted-foreground">Use it the next time you sign in.</p>
          <Button size="lg" onClick={() => router.push("/settings")}>
            Done
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
          {hasPassword && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Current password</label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setCurrentPassword(e.target.value);
                  if (error) setError(null);
                }}
                className="h-11"
                ref={firstInputRef}
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">New password</label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (error) setError(null);
              }}
              className="h-11"
              ref={hasPassword ? undefined : firstInputRef}
            />
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Confirm new password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error) setError(null);
              }}
              className="h-11"
            />
          </div>
          {error && <p className="text-caption text-danger">{error}</p>}
          <Button
            size="lg"
            onClick={handleSubmit}
            disabled={saving || !newPassword || !confirmPassword || (hasPassword ? !currentPassword : false)}
          >
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : hasPassword ? "Update password" : "Add password"}
          </Button>
        </div>
      )}
    </div>
  );
}
