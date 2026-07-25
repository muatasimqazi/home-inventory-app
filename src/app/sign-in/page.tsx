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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-yellow">
            <Icon name="box" size={26} className="text-white" />
          </div>
          <p className="text-display font-medium text-white">Shohaz</p>
          <p className="text-body text-white/60">Find anything you own, in seconds.</p>
        </div>

        {mode === "authenticating" ? (
          <div className="flex flex-col items-center gap-3 py-6 text-white">
            <Icon name="spinner" size={24} className="animate-spin" />
            <p className="text-body text-white/70">Signing in…</p>
          </div>
        ) : mode === "email" || mode === "error" ? (
          <div className="flex w-full flex-col gap-3">
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 border-white/20 bg-white/10 text-white placeholder:text-white/40"
            />
            {mode === "error" && <p className="text-caption text-danger">Couldn&apos;t sign in. Check your details and try again.</p>}
            <Button size="lg" onClick={authenticate} disabled={!email || !password}>
              Continue
            </Button>
            <button type="button" onClick={() => setMode("default")} className="text-caption text-white/60">
              Back
            </button>
          </div>
        ) : (
          <div className="flex w-full flex-col gap-3">
            <Button size="lg" variant="secondary" className="border border-white/15 bg-white text-ink hover:bg-white/90" onClick={authenticate}>
              Continue with Google
            </Button>
            <Button size="lg" variant="outline" className="border-white/20 bg-transparent text-white hover:bg-white/10" onClick={() => setMode("email")}>
              Continue with email
            </Button>
          </div>
        )}

        <p className="text-center text-micro text-white/40">By continuing, you agree this is a demo build of Shohaz.</p>
      </div>
    </div>
  );
}
