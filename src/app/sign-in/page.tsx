"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "default" | "email" | "authenticating" | "error";

export default function SignInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("default");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function authenticate() {
    setMode("authenticating");
    setTimeout(() => {
      if (password && password.length < 4) {
        setMode("error");
        return;
      }
      router.push("/");
    }, 700);
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
        ) : mode === "email" || mode === "error" ? (
          <div className="flex w-full flex-col gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
            {mode === "error" && <p className="text-caption text-danger">Couldn&apos;t sign in. Check your details and try again.</p>}
            <Button size="lg" onClick={authenticate} disabled={!email || !password}>
              Continue
            </Button>
            <button type="button" onClick={() => setMode("default")} className="text-caption text-muted-foreground">
              Back
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={authenticate}>
              Continue with Google
            </Button>
            <Button size="lg" variant="outline" onClick={() => setMode("email")}>
              Continue with email
            </Button>
          </div>
        )}

        <p className="text-center text-micro text-muted-foreground">By continuing, you agree this is a demo build of Shohaz.</p>
      </div>
    </div>
  );
}
