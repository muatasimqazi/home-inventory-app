"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useInventoryStore } from "@/lib/store";
import { PERSON_RELATIONSHIPS, PERSON_RELATIONSHIP_LABEL, type Person, type PersonRelationship } from "@/lib/types";
import { cn } from "@/lib/utils";

type Step = "details" | "linkChoice" | "inviteEmail";

interface AddPersonSheetProps {
  /** A signal to open the sheet, not just a mirror of its own visibility — see onOpenChange below for why. */
  open: boolean;
  /** Optional — the sheet tracks its own internal visibility so it still opens and closes correctly for a caller that only wires `open`/`onCreated` (see the file-level comment). Wire this too, as every other Sheet-shaped component in this codebase does, to keep the caller's own state in sync so a second open works cleanly. */
  onOpenChange?: (open: boolean) => void;
  /** Fires once a real Person row exists — the "Not right now" (managed profile) path. "Invite to the app" doesn't call this; see the file-level comment on why. */
  onCreated: (person: Person) => void;
  /** Whether the caller can send a household invite — `invites` INSERT is owner-only at the RLS layer (0001_init.sql), so a non-owner's "Invite to the app" tap would otherwise just fail with a permission error. Defaults to true; pass the caller's own isOwner check to hide that option for a non-owner instead. */
  canInvite?: boolean;
}

const RELATIONSHIP_OPTIONS = PERSON_RELATIONSHIPS.map((value) => ({ value, label: PERSON_RELATIONSHIP_LABEL[value] }));

/**
 * "+ Add someone" (PRD `v4 - Enhanced Features` §22) — Household Ledger
 * Implementation Plan §3, Workstream 2. Two things worth knowing before
 * touching this file:
 *
 * 1. Two-prop-compatible by design. Workstream 1 (Onboarding) may have
 *    been built in parallel against a stub `{ open, onCreated }` prop
 *    interface. `onOpenChange` here is optional and the sheet keeps its
 *    own internal visibility state, so it still opens and closes
 *    correctly even for a caller that never wires a close callback —
 *    it just can't be silently *re-opened* a second time without one,
 *    which is a real, inherent limit of a two-prop "open" contract with
 *    no way for the child to report "the user closed me", not a bug in
 *    this component.
 *
 * 2. "Invite to the app" deliberately does not create a Person row —
 *    it only sends a plain household invite via the existing
 *    `inviteMember`. accept_invite() (0017_household_ledger_core.sql)
 *    already creates its own Person row the moment an invite is
 *    *accepted*, and today's schema has no column linking a pending
 *    invite back to a Person row created ahead of time. Creating one
 *    here too would leave two Person rows for one human once they
 *    accept. This is the real, unresolved "managed-profile-to-account
 *    conversion" question the Implementation Plan §9 flags — not
 *    something to paper over with a row that would just need
 *    de-duplicating later.
 */
export function AddPersonSheet({ open, onOpenChange, onCreated, canInvite = true }: AddPersonSheetProps) {
  const addPerson = useInventoryStore((s) => s.addPerson);
  const setPersonAvatar = useInventoryStore((s) => s.setPersonAvatar);
  const inviteMember = useInventoryStore((s) => s.inviteMember);

  const [visible, setVisible] = useState(open);
  const [step, setStep] = useState<Step>("details");
  const [displayName, setDisplayName] = useState("");
  const [relationship, setRelationship] = useState<PersonRelationship>("family_member");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fresh state every time the caller signals a new open — adjusted during
  // render (React's documented pattern for "reset state when a prop
  // changes"), not in an effect, so it takes effect before the first paint
  // instead of flashing stale values. A stub caller that only ever flips
  // `open` true→true again wouldn't retrigger this, but that's the same
  // inherent two-prop-contract limit noted above.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setVisible(true);
      setStep("details");
      setDisplayName("");
      setRelationship("family_member");
      setPhotoFile(null);
      setPhotoPreviewUrl(null);
      setEmail("");
      setNameError(null);
      setSaving(false);
    }
  }

  function close() {
    setVisible(false);
    onOpenChange?.(false);
  }

  function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function handleContinue() {
    if (!displayName.trim()) {
      setNameError("Give them a name.");
      return;
    }
    setStep("linkChoice");
  }

  async function handleManagedProfile() {
    setSaving(true);
    const person = addPerson({ displayName: displayName.trim(), relationship });
    if (photoFile) {
      const result = await setPersonAvatar(person.id, photoFile);
      if (!result.ok) toast.error(result.error ?? "Added, but the photo couldn't be uploaded.");
    }
    toast.success(`Added ${person.displayName}`);
    setSaving(false);
    onCreated(person);
    close();
  }

  function handleSendInvite() {
    if (!email.trim()) return;
    inviteMember(email.trim());
    toast.success(`Invite sent to ${email.trim()}`);
    close();
  }

  const name = displayName.trim();

  return (
    <Sheet open={visible} onOpenChange={(next) => (next ? setVisible(true) : close())}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">
            {step === "details" && "Add someone"}
            {step === "linkChoice" && `Will ${name || "they"} use the app?`}
            {step === "inviteEmail" && `Invite ${name || "them"}`}
          </SheetTitle>
        </SheetHeader>

        {step === "details" && (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div className="flex items-center gap-3">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
              <button type="button" onClick={() => photoInputRef.current?.click()} className="shrink-0" aria-label="Add a photo">
                <Avatar className="size-16">
                  {photoPreviewUrl ? (
                    <AvatarImage src={photoPreviewUrl} alt="" />
                  ) : (
                    <AvatarFallback className="text-item-title">{name ? name.charAt(0).toUpperCase() : <Icon name="user" size={20} />}</AvatarFallback>
                  )}
                </Avatar>
              </button>
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="text-caption font-medium text-ink underline underline-offset-2"
              >
                {photoPreviewUrl ? "Change photo" : "Add a photo (optional)"}
              </button>
            </div>

            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Name</label>
              <Input
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="e.g. Emma"
                className="h-11"
                autoFocus
              />
              {nameError && <p className="mt-1 text-caption text-danger">{nameError}</p>}
            </div>

            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Relationship</label>
              <div className="flex flex-wrap gap-1.5">
                {RELATIONSHIP_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setRelationship(opt.value)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
                      relationship === opt.value ? "bg-yellow text-white" : "bg-surface-muted text-ink"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleContinue}>
              Continue
            </Button>
          </div>
        )}

        {step === "linkChoice" && (
          <div className="flex flex-col gap-3 px-4 pb-6">
            <p className="text-caption text-muted-foreground">
              A managed profile doesn&apos;t need an email or password — {name || "they"} can still own belongings and show up in filters.
              You can invite {name || "them"} to sign in for themselves any time.
            </p>
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleManagedProfile} disabled={saving}>
              {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Not right now"}
            </Button>
            {canInvite && (
              <Button size="lg" variant="outline" onClick={() => setStep("inviteEmail")} disabled={saving}>
                Invite to the app
              </Button>
            )}
          </div>
        )}

        {step === "inviteEmail" && (
          <div className="flex flex-col gap-3 px-4 pb-6">
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Email address</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-11" autoFocus />
            </div>
            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSendInvite} disabled={!email.trim()}>
              Send invite
            </Button>
            <button
              type="button"
              onClick={() => setStep("linkChoice")}
              className="text-center text-caption font-medium text-muted-foreground underline underline-offset-2"
            >
              Back
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
