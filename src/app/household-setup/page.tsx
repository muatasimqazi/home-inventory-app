"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Person } from "@/lib/types";

// PRD v4 - Enhanced Features §11-§22: no mandatory household-name, member,
// or location wizard. A household + home are created invisibly the moment
// an authenticated, zero-household user lands here (§13); the only thing
// this page actually asks anyone to type is the rare "create an additional
// household" path reached deliberately from Settings, since that isn't an
// onboarding step at all.
type Mode = "create" | "join";
type CreatePhase = "loading" | "creating" | "naming" | "ready" | "error";

function deriveFirstName(fullName: string, email: string): string {
  const trimmed = fullName.trim();
  if (trimmed) return trimmed.split(/\s+/)[0];
  const local = email.split("@")[0] ?? "";
  if (!local) return "My";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

async function readAccountMeta(): Promise<{ displayName: string; avatarUrl?: string }> {
  const { data } = await getSupabaseBrowserClient().auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const fullName = (meta.full_name as string) || (meta.name as string) || "";
  const avatarUrl = (meta.avatar_url as string) || (meta.picture as string) || undefined;
  return { displayName: fullName.trim(), avatarUrl };
}

export default function HouseholdSetupPage() {
  return (
    <Suspense>
      <HouseholdSetupInner />
    </Suspense>
  );
}

function HouseholdSetupInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>(searchParams.get("mode") === "join" ? "join" : "create");

  const isHydrated = useInventoryStore((s) => s.isHydrated);
  const currentUserEmail = useInventoryStore((s) => s.currentUserEmail);
  const households = useInventoryStore((s) => s.households);
  const createHousehold = useInventoryStore((s) => s.createHousehold);
  const acceptInvite = useInventoryStore((s) => s.acceptInvite);

  const [phase, setPhase] = useState<CreatePhase>("loading");
  const [readyName, setReadyName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [manualName, setManualName] = useState("");
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [addedPeople, setAddedPeople] = useState<Person[]>([]);
  const autoCreateStarted = useRef(false);

  const [joinName, setJoinName] = useState("");
  const [joinEmail, setJoinEmail] = useState("");
  const [joinNameError, setJoinNameError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  async function runAutoCreate() {
    setErrorMessage(null);
    setPhase("creating");
    try {
      const { displayName: fullName, avatarUrl } = await readAccountMeta();
      const firstName = deriveFirstName(fullName, currentUserEmail);
      const name = `${firstName}'s Home`;
      await createHousehold({ name, displayName: fullName || firstName, email: currentUserEmail, avatarUrl });
      setReadyName(name);
      setPhase("ready");
    } catch (e) {
      autoCreateStarted.current = false;
      setErrorMessage(e instanceof Error ? e.message : "Couldn't set up your home.");
      setPhase("error");
    }
  }

  // Zero-household user (the real onboarding case, §13): auto-create
  // invisibly, no form. A user who already has a household and explicitly
  // navigated here (Settings → "Create a new household") gets a minimal
  // name field instead — that's a deliberate secondary action, not
  // onboarding, so it's exempt from the "no naming screen" rule.
  useEffect(() => {
    if (mode !== "create" || !isHydrated) return;
    // Already has a household — the "naming" phase is derived below instead
    // of set here, so there's nothing for this effect to do but skip the
    // auto-create it would otherwise kick off.
    if (households.length > 0) return;
    if (autoCreateStarted.current) return;
    autoCreateStarted.current = true;
    void runAutoCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, isHydrated, households.length]);

  // Derived, not stored: a user who already has a household and landed
  // here deliberately (Settings → "Create a new household") should see the
  // naming step the moment that's known, without a redundant setState.
  const displayPhase: CreatePhase =
    phase === "loading" && mode === "create" && isHydrated && households.length > 0 ? "naming" : phase;

  async function handleCreateNamed() {
    const trimmed = manualName.trim();
    if (!trimmed) {
      setErrorMessage("Give your household a name.");
      return;
    }
    setPhase("creating");
    try {
      const { displayName: fullName, avatarUrl } = await readAccountMeta();
      const firstName = deriveFirstName(fullName, currentUserEmail);
      await createHousehold({ name: trimmed, displayName: fullName || firstName, email: currentUserEmail, avatarUrl });
      setReadyName(trimmed);
      setPhase("ready");
      toast.success(`${trimmed} created`);
    } catch (e) {
      setErrorMessage(e instanceof Error ? e.message : "Couldn't create household.");
      setPhase("naming");
    }
  }

  async function handleJoin() {
    let hasError = false;
    if (!joinName.trim()) {
      setJoinNameError("Let others know who you are.");
      hasError = true;
    }
    if (!joinEmail.trim()) {
      setJoinError("Enter the email your invite was sent to.");
      hasError = true;
    }
    if (hasError) return;
    setJoining(true);
    const result = await acceptInvite(joinEmail.trim(), joinName.trim());
    setJoining(false);
    if (!result.ok) {
      setJoinError(result.error ?? "No pending invite found for that email.");
      return;
    }
    toast.success(`You've joined ${result.household?.name}`);
    router.push("/");
  }

  function goBack() {
    if (mode === "join") {
      setMode("create");
      setJoinError(null);
      return;
    }
    router.back();
  }

  const showBack = mode === "join" || displayPhase === "naming";
  const headerTitle = mode === "join" ? "Join household" : displayPhase === "naming" ? "New household" : "Your home";

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        {showBack ? (
          <button
            type="button"
            onClick={goBack}
            className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
            aria-label="Back"
          >
            <Icon name="arrowLeft" size={18} />
          </button>
        ) : null}
        <h1 className="text-body font-semibold text-ink">{headerTitle}</h1>
      </header>

      <div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-4 pb-28">
        {mode === "join" ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Redeem an invite</h2>
              <p className="mt-1 text-body text-muted-foreground">
                Enter the email your invite was sent to — it must match your signed-in email.
              </p>
            </div>
            <Field label="Your name">
              <Input
                value={joinName}
                onChange={(e) => {
                  setJoinName(e.target.value);
                  setJoinNameError(null);
                }}
                placeholder="e.g. Alex"
                className="h-11 bg-white"
                autoFocus
              />
              <p className="mt-1 text-caption text-muted-foreground">Shown to other members instead of a generic &ldquo;You&rdquo;.</p>
              {joinNameError && <p className="mt-1 text-caption text-danger">{joinNameError}</p>}
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={joinEmail}
                onChange={(e) => {
                  setJoinEmail(e.target.value);
                  setJoinError(null);
                }}
                placeholder="you@example.com"
                className="h-11 bg-white"
              />
              {joinError && <p className="mt-1 text-caption text-danger">{joinError}</p>}
            </Field>
          </>
        ) : displayPhase === "loading" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20">
            <Icon name="spinner" size={24} className="animate-spin text-ink" />
          </div>
        ) : displayPhase === "creating" ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-20 text-center">
            <Icon name="spinner" size={24} className="animate-spin text-ink" />
            <p className="text-body text-muted-foreground">Setting up your home…</p>
          </div>
        ) : displayPhase === "error" ? (
          <div className="flex flex-1 flex-col items-center gap-3 py-20 text-center">
            <Icon name="danger" size={24} className="text-danger" />
            <p className="text-body font-medium text-ink">Couldn&apos;t set up your home</p>
            {errorMessage && <p className="text-caption text-muted-foreground">{errorMessage}</p>}
            <Button onClick={runAutoCreate}>Try again</Button>
          </div>
        ) : displayPhase === "naming" ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Name this household</h2>
              <p className="mt-1 text-body text-muted-foreground">You can rename this later from Settings.</p>
            </div>
            <Field label="Household name">
              <Input
                value={manualName}
                onChange={(e) => {
                  setManualName(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. Lake House"
                className="h-11 bg-white"
                autoFocus
              />
              {errorMessage && <p className="mt-1 text-caption text-danger">{errorMessage}</p>}
            </Field>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 pt-6 text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-yellow">
                <Icon name="ai" size={26} className="text-white" />
              </div>
              {readyName && <p className="text-caption text-muted-foreground">{readyName} is ready</p>}
              <h2 className="text-desktop-title font-semibold text-ink">Teach your home its first thing.</h2>
              <p className="text-body text-muted-foreground">Just take a photo. We&apos;ll figure out the rest.</p>
            </div>

            {addedPeople.length > 0 && (
              <div className="flex flex-col gap-2">
                {addedPeople.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-caption font-semibold text-brand-700">
                      {p.displayName.slice(0, 1).toUpperCase()}
                    </div>
                    <p className="text-body font-medium text-ink">{p.displayName}</p>
                  </div>
                ))}
              </div>
            )}

            {/* PRD §22: not a dedicated onboarding step — a fully optional,
                skippable affordance a user can reach for if they already
                know they want to, not something gating the flow. */}
            <button
              type="button"
              onClick={() => setAddPersonOpen(true)}
              className="tap-target flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-white py-3 text-body font-medium text-ink hover:bg-surface-muted"
            >
              <Icon name="plus" size={16} />
              Add someone
            </button>
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {mode === "join" ? (
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleJoin} disabled={joining}>
              {joining ? "Redeeming…" : "Redeem invite"}
            </Button>
          ) : displayPhase === "naming" ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleCreateNamed}>
                Create household
              </Button>
              <Button size="lg" variant="outline" onClick={() => setMode("join")}>
                I have an invite code
              </Button>
            </>
          ) : displayPhase === "ready" ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={() => router.push("/capture")}>
                Open Camera
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push("/")}>
                Skip for now
              </Button>
            </>
          ) : displayPhase === "loading" || displayPhase === "creating" ? null : (
            <Button size="lg" variant="outline" onClick={() => setMode("join")}>
              I have an invite code
            </Button>
          )}
        </div>
      </div>

      <AddPersonSheet
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        onCreated={(person) => {
          setAddPersonOpen(false);
          setAddedPeople((p) => [...p, person]);
        }}
      />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
