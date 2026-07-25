"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "choice" | "create" | "join";

export default function HouseholdSetupPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("choice");
  const [name, setName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleCreate() {
    if (!name.trim()) {
      setError("Give your household a name.");
      return;
    }
    toast.success(`${name} created — you're the Owner`);
    router.push("/");
  }

  function handleJoin() {
    setError("No pending invite found for that email in this demo.");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-muted px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        {mode === "choice" && (
          <div className="flex flex-col gap-3 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-yellow">
              <Icon name="users" size={22} className="text-ink" />
            </div>
            <h1 className="text-screen-title font-medium text-ink">Set up your household</h1>
            <p className="text-body text-muted-foreground">Households are shared — everyone in it sees the same inventory.</p>
            <Button size="lg" className="mt-2" onClick={() => setMode("create")}>
              Create a household
            </Button>
            <Button size="lg" variant="outline" onClick={() => setMode("join")}>
              I have an invite
            </Button>
          </div>
        )}

        {mode === "create" && (
          <div className="flex flex-col gap-3">
            <h1 className="text-screen-title font-medium text-ink">Name your household</h1>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. The Qazi Household"
              className="h-11"
              autoFocus
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button size="lg" onClick={handleCreate}>
              Create household
            </Button>
            <button type="button" onClick={() => setMode("choice")} className="text-caption text-muted-foreground">
              Back
            </button>
          </div>
        )}

        {mode === "join" && (
          <div className="flex flex-col gap-3">
            <h1 className="text-screen-title font-medium text-ink">Redeem an invite</h1>
            <p className="text-caption text-muted-foreground">
              Enter the email your invite was sent to — it must match your signed-in email.
            </p>
            <Input
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setError(null);
              }}
              placeholder="you@example.com"
              className="h-11"
              autoFocus
            />
            {error && <p className="text-caption text-danger">{error}</p>}
            <Button size="lg" onClick={handleJoin}>
              Redeem invite
            </Button>
            <button type="button" onClick={() => setMode("choice")} className="text-caption text-muted-foreground">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
