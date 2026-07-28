"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInventoryStore } from "@/lib/store";
import type { Location } from "@/lib/types";

type Mode = "create" | "join";
type Step = 1 | 2 | 3 | 4 | 5;

const STEP_TITLES: Record<Step, string> = {
  1: "Set up home",
  2: "Members",
  3: "Locations",
  4: "First container",
  5: "Ready",
};

const SUGGESTED_LOCATIONS = [
  { name: "Garage", description: "For tools, bins, and seasonal storage", emoji: "🚗" },
  { name: "Attic", description: "Long-term storage and keepsakes", emoji: "🏠" },
  { name: "Office", description: "Documents, devices, and valuables", emoji: "🗄️" },
];

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
  const [step, setStep] = useState<Step>(1);

  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const currentUserEmail = useInventoryStore((s) => s.currentUserEmail);
  const members = useInventoryStore((s) => s.members);
  const createHousehold = useInventoryStore((s) => s.createHousehold);
  const createLocation = useInventoryStore((s) => s.createLocation);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const assignDisplayCode = useInventoryStore((s) => s.assignDisplayCode);
  const inviteMember = useInventoryStore((s) => s.inviteMember);
  const acceptInvite = useInventoryStore((s) => s.acceptInvite);
  const me = members.find((m) => m.userId === currentUserId);

  // Step 1 — create household
  const [myName, setMyName] = useState("");
  const [householdName, setHouseholdName] = useState("");
  const [householdType, setHouseholdType] = useState<"home" | "apartment" | "other">("home");
  const [createError, setCreateError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Step 2 — invite members
  const [inviteInput, setInviteInput] = useState("");
  const [invitedEmails, setInvitedEmails] = useState<string[]>([]);

  // Step 3 — locations
  const [selectedSuggested, setSelectedSuggested] = useState<Set<string>>(new Set(["Garage"]));
  const [customLocationName, setCustomLocationName] = useState("");
  const [customLocations, setCustomLocations] = useState<string[]>([]);
  const [createdLocations, setCreatedLocations] = useState<Location[]>([]);

  // Step 4 — first container
  const [containerName, setContainerName] = useState("");
  const [containerLocationId, setContainerLocationId] = useState<string | null>(null);
  const [nfcOn, setNfcOn] = useState(true);
  const [createdContainerName, setCreatedContainerName] = useState<string | null>(null);
  const [createdContainerCode, setCreatedContainerCode] = useState<string | null>(null);

  // Step 5 — join (redeem invite) mode
  const [joinEmail, setJoinEmail] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);

  function goBack() {
    if (mode === "join") {
      setMode("create");
      setJoinError(null);
      return;
    }
    if (step > 1) {
      setStep((s) => (s - 1) as Step);
      return;
    }
    router.back();
  }

  async function handleCreateHousehold() {
    let hasError = false;
    if (!myName.trim()) {
      setNameError("Let others know who you are.");
      hasError = true;
    }
    if (!householdName.trim()) {
      setCreateError("Give your household a name.");
      hasError = true;
    }
    if (hasError) return;
    try {
      await createHousehold({
        name: householdName.trim(),
        displayName: myName.trim(),
        email: me?.email ?? currentUserEmail,
        avatarUrl: me?.avatarUrl,
      });
      toast.success(`${householdName.trim()} created — you're the Owner`);
      setStep(2);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Couldn't create household.");
    }
  }

  function addInviteEmail() {
    const value = inviteInput.trim();
    if (value && !invitedEmails.includes(value)) setInvitedEmails((e) => [...e, value]);
    setInviteInput("");
  }

  function handleSendInvites() {
    invitedEmails.forEach((email) => inviteMember(email));
    if (invitedEmails.length > 0) toast.success(`Sent ${invitedEmails.length} invite${invitedEmails.length === 1 ? "" : "s"}`);
    setStep(3);
  }

  function toggleSuggested(name: string) {
    setSelectedSuggested((s) => {
      const next = new Set(s);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function addCustomLocation() {
    const value = customLocationName.trim();
    if (value && !customLocations.includes(value)) setCustomLocations((l) => [...l, value]);
    setCustomLocationName("");
  }

  function handleContinueLocations() {
    const toCreate = [
      ...SUGGESTED_LOCATIONS.filter((l) => selectedSuggested.has(l.name)),
      ...customLocations.map((name) => ({ name, description: undefined, emoji: undefined })),
    ];
    const created = toCreate.map((l) => createLocation({ name: l.name, description: l.description, coverPhotoEmoji: l.emoji }));
    setCreatedLocations(created);
    if (created.length > 0 && !containerLocationId) setContainerLocationId(created[0].id);
    setStep(4);
  }

  async function handleCreateBin() {
    const location = createdLocations.find((l) => l.id === containerLocationId) ?? createdLocations[0];
    const name = containerName.trim() || (location ? `${location.name} Container 1` : "Container 1");
    if (location) {
      const container = createContainer({ name, locationId: location.id });
      const result = await assignDisplayCode(container.id);
      setCreatedContainerName(name);
      setCreatedContainerCode(result.ok ? (result.code ?? null) : null);
      toast.success(`${name} created`);
    }
    setStep(5);
  }

  async function handleJoin() {
    let hasError = false;
    if (!myName.trim()) {
      setNameError("Let others know who you are.");
      hasError = true;
    }
    if (!joinEmail.trim()) {
      setJoinError("Enter the email your invite was sent to.");
      hasError = true;
    }
    if (hasError) return;
    const result = await acceptInvite(joinEmail.trim(), myName.trim());
    if (!result.ok) {
      setJoinError(result.error ?? "No pending invite found for that email.");
      return;
    }
    toast.success(`You've joined ${result.household?.name}`);
    router.push("/");
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goBack}
            className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
            aria-label="Back"
          >
            <Icon name="arrowLeft" size={18} />
          </button>
          <h1 className="text-body font-semibold text-ink">{mode === "join" ? "Join household" : STEP_TITLES[step]}</h1>
        </div>
        {mode === "create" && <ProgressDots step={step} />}
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
                value={myName}
                onChange={(e) => {
                  setMyName(e.target.value);
                  setNameError(null);
                }}
                placeholder="e.g. Alex"
                className="h-11 bg-white"
                autoFocus
              />
              <p className="mt-1 text-caption text-muted-foreground">Shown to other members instead of a generic &ldquo;You&rdquo;.</p>
              {nameError && <p className="mt-1 text-caption text-danger">{nameError}</p>}
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
        ) : step === 1 ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Create your household</h2>
              <p className="mt-1 text-body text-muted-foreground">
                This is the shared space where locations, containers, items, and labels live.
              </p>
            </div>

            <Field label="Your name">
              <Input
                value={myName}
                onChange={(e) => {
                  setMyName(e.target.value);
                  setNameError(null);
                }}
                placeholder="e.g. Alex"
                className="h-11 bg-white"
                autoFocus
              />
              <p className="mt-1 text-caption text-muted-foreground">Shown to other members instead of a generic &ldquo;You&rdquo;.</p>
              {nameError && <p className="mt-1 text-caption text-danger">{nameError}</p>}
            </Field>

            <Field label="Household name">
              <Input
                value={householdName}
                onChange={(e) => {
                  setHouseholdName(e.target.value);
                  setCreateError(null);
                }}
                placeholder="e.g. The Qazi Household"
                className="h-11 bg-white"
              />
              {createError && <p className="mt-1 text-caption text-danger">{createError}</p>}
            </Field>

            <Field label="Household type">
              <Tabs value={householdType} onValueChange={(v) => setHouseholdType(v as typeof householdType)}>
                <TabsList className="w-full">
                  <TabsTrigger value="home">Home</TabsTrigger>
                  <TabsTrigger value="apartment">Apartment</TabsTrigger>
                  <TabsTrigger value="other">Other</TabsTrigger>
                </TabsList>
              </Tabs>
            </Field>

            <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-yellow">
                <Icon name="box" size={20} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-body font-semibold text-ink">{householdName.trim() || "Your household"}</p>
                <p className="text-caption text-muted-foreground">0 locations · 0 containers · Owner access</p>
              </div>
            </div>
            <p className="text-caption text-muted-foreground">You can rename this later from Settings.</p>
          </>
        ) : step === 2 ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Invite household members</h2>
              <p className="mt-1 text-body text-muted-foreground">Members can scan labels, find containers, and add items. You control roles.</p>
            </div>

            <Field label="Invite email">
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInviteEmail();
                    }
                  }}
                  placeholder="dev@example.com"
                  className="h-11 flex-1"
                />
                <Button type="button" className="h-11 bg-ink text-white hover:bg-ink/90" onClick={addInviteEmail}>
                  Add
                </Button>
              </div>
            </Field>

            <div className="flex flex-col gap-2">
              <MemberRow initial={(me?.displayName ?? myName).slice(0, 1)} name={me?.displayName ?? myName} sublabel="Owner" />
              {invitedEmails.map((email) => (
                <MemberRow
                  key={email}
                  initial={email.slice(0, 1).toUpperCase()}
                  name={email}
                  sublabel="Invited — pending"
                  onRemove={() => setInvitedEmails((e) => e.filter((x) => x !== email))}
                />
              ))}
            </div>

            <div className="rounded-xl border border-brand-200 bg-brand-100 p-3">
              <p className="text-caption text-brand-700">Owners manage settings and members. Members can add, move, and archive inventory.</p>
            </div>
          </>
        ) : step === 3 ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Add your first locations</h2>
              <p className="mt-1 text-body text-muted-foreground">Locations are rooms or areas where containers and items live.</p>
            </div>

            <div className="flex flex-col gap-2">
              {SUGGESTED_LOCATIONS.map((loc) => {
                const selected = selectedSuggested.has(loc.name);
                return (
                  <button
                    key={loc.name}
                    type="button"
                    onClick={() => toggleSuggested(loc.name)}
                    className={
                      selected
                        ? "flex items-center gap-3 rounded-lg border border-yellow bg-brand-100 p-3 text-left"
                        : "flex items-center gap-3 rounded-lg border border-border bg-white p-3 text-left"
                    }
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xl" aria-hidden>
                      {loc.emoji}
                    </span>
                    <span className="min-w-0 flex-1">
                      <p className="text-body font-semibold text-ink">{loc.name}</p>
                      <p className="truncate text-caption text-muted-foreground">{loc.description}</p>
                    </span>
                    {selected && <Icon name="check" size={18} className="shrink-0 text-ink" />}
                  </button>
                );
              })}
              {customLocations.map((name) => (
                <div key={name} className="flex items-center gap-3 rounded-lg border border-yellow bg-brand-100 p-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-xl" aria-hidden>
                    📍
                  </span>
                  <span className="min-w-0 flex-1 text-body font-semibold text-ink">{name}</span>
                  <Icon name="check" size={18} className="shrink-0 text-ink" />
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-3 shadow-sm">
              <p className="text-body font-semibold text-ink">Add another location</p>
              <p className="text-caption text-muted-foreground">Basement, closet, shed, pantry...</p>
              <div className="flex gap-2">
                <Input
                  value={customLocationName}
                  onChange={(e) => setCustomLocationName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomLocation();
                    }
                  }}
                  placeholder="Location name"
                  className="h-11 flex-1"
                />
                <Button type="button" variant="outline" className="h-11" onClick={addCustomLocation}>
                  Add location
                </Button>
              </div>
            </div>
          </>
        ) : step === 4 ? (
          <>
            <div>
              <h2 className="text-screen-title font-semibold text-ink">Create a labeled container</h2>
              <p className="mt-1 text-body text-muted-foreground">Each container gets a readable ID and a QR/NFC label for fast scanning.</p>
            </div>

            <Field label="Container name">
              <Input
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                placeholder={createdLocations[0] ? `${createdLocations[0].name} Container 1` : "e.g. Garage Container 1"}
                className="h-11"
              />
            </Field>

            {createdLocations.length > 0 && (
              <Field label="Location">
                <div className="flex flex-wrap gap-2">
                  {createdLocations.map((loc) => (
                    <button
                      key={loc.id}
                      type="button"
                      onClick={() => setContainerLocationId(loc.id)}
                      className={
                        containerLocationId === loc.id
                          ? "tap-target rounded-full border border-yellow bg-brand-100 px-3 text-caption font-medium text-ink"
                          : "tap-target rounded-full border border-border bg-white px-3 text-caption text-ink"
                      }
                    >
                      {loc.name}
                    </button>
                  ))}
                </div>
              </Field>
            )}

            {createdLocations.length === 0 && (
              <p className="text-caption text-muted-foreground">
                No locations yet — go back to add one, or add this container later from the Locations tab.
              </p>
            )}

            <div className="flex items-center justify-between rounded-lg border border-border bg-white p-3">
              <p className="text-caption font-medium text-ink">Print on NFC tag</p>
              <Switch checked={nfcOn} onCheckedChange={setNfcOn} />
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3 pt-2 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-yellow">
                <Icon name="box" size={22} className="text-white" />
              </div>
              <h2 className="text-desktop-title font-semibold text-ink">Your home is ready</h2>
              <p className="text-body text-muted-foreground">
                Start by adding items with photos, or scan a tag when you are standing near a container.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <ChecklistRow label="Account created" />
              <ChecklistRow label={`${householdName.trim() || "Household"} created`} />
              {invitedEmails.length > 0 && (
                <ChecklistRow label={`${invitedEmails.length} member${invitedEmails.length === 1 ? "" : "s"} invited`} />
              )}
              {createdLocations.map((loc) => (
                <ChecklistRow key={loc.id} label={`${loc.name} added`} />
              ))}
              {createdContainerCode && <ChecklistRow label={`${createdContainerCode} container label ready`} />}
            </div>

            {createdContainerName && (
              <div className="flex items-start gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-100">
                  <Icon name="camera" size={20} className="text-brand-700" />
                </div>
                <div>
                  <p className="text-body font-semibold text-ink">Recommended next step</p>
                  <p className="mt-1 text-caption text-muted-foreground">Add items to {createdContainerName} with the photo capture flow.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-white px-4 py-3">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          {mode === "join" ? (
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleJoin}>
              Redeem invite
            </Button>
          ) : step === 1 ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleCreateHousehold}>
                Create household
              </Button>
              <Button size="lg" variant="outline" onClick={() => setMode("join")}>
                I have an invite code
              </Button>
            </>
          ) : step === 2 ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSendInvites}>
                Send invites
              </Button>
              <Button size="lg" variant="outline" onClick={() => setStep(3)}>
                Skip for now
              </Button>
            </>
          ) : step === 3 ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleContinueLocations}>
                Continue
              </Button>
              <Button size="lg" variant="outline" onClick={() => setStep(4)}>
                Skip for now
              </Button>
            </>
          ) : step === 4 ? (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleCreateBin}>
                Create container
              </Button>
              <Button size="lg" variant="outline" onClick={() => setStep(5)}>
                Add container later
              </Button>
            </>
          ) : (
            <>
              <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={() => router.push("/capture")}>
                Add items
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push("/")}>
                Go to dashboard
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressDots({ step }: { step: Step }) {
  return (
    <div className="flex shrink-0 items-center gap-1" aria-hidden>
      {([1, 2, 3, 4, 5] as Step[]).map((s) => (
        <span key={s} className={s === step ? "h-2 w-5 rounded-full bg-yellow" : "size-2 rounded-full bg-border"} />
      ))}
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

function MemberRow({ initial, name, sublabel, onRemove }: { initial: string; name: string; sublabel: string; onRemove?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-caption font-semibold text-brand-700">
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-semibold text-ink">{name}</p>
        <p className="text-caption text-muted-foreground">{sublabel}</p>
      </div>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remove ${name}`} className="tap-target flex size-9 items-center justify-center rounded-full hover:bg-surface-muted">
          <Icon name="close" size={16} className="text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

function ChecklistRow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-white p-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-brand-100 text-brand-700">
        <Icon name="check" size={14} />
      </div>
      <p className="text-body font-medium text-ink">{label}</p>
    </div>
  );
}
