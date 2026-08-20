"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AddPersonSheet } from "@/components/add-person-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { PERSON_RELATIONSHIPS, PERSON_RELATIONSHIP_LABEL, type Member, type Person, type PersonRelationship } from "@/lib/types";
import { cn } from "@/lib/utils";

const RELATIONSHIP_OPTIONS = PERSON_RELATIONSHIPS.map((value) => ({ value, label: PERSON_RELATIONSHIP_LABEL[value] }));

/**
 * "People" (formerly "Household Members") — Household Ledger
 * Implementation Plan §3, Workstream 2 / PRD §8/§9/§23. Generalized to
 * list `people` (every authenticated Member's own row plus every managed
 * profile) instead of `members` directly:
 *
 * - Authenticated members (Person.linkedUserId set) still get the
 *   original owner-only Transfer ownership / Remove member actions —
 *   unchanged, still act on the `members` table, still gated by isOwner
 *   client-side to match that table's own owner-only RLS.
 * - Every person — linked or managed — gets an Edit action for
 *   relationship + avatar (managed profiles also get Name), matching
 *   `people`'s own RLS: any household member can read/write any Person
 *   row, so this isn't owner-gated the way member management is.
 * - "+ Add person" replaces the old raw-email-only "+ Invite" button —
 *   AddPersonSheet's own "Invite to the app" step now covers sending an
 *   invite, so there's one entry point instead of two.
 */
export default function PeoplePage() {
  const router = useRouter();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const people = useInventoryStore((s) => s.people);
  const invites = useInventoryStore((s) => s.invites);
  const households = useInventoryStore((s) => s.households);
  const cancelInvite = useInventoryStore((s) => s.cancelInvite);
  const removeMember = useInventoryStore((s) => s.removeMember);
  const transferOwnership = useInventoryStore((s) => s.transferOwnership);
  const leaveHousehold = useInventoryStore((s) => s.leaveHousehold);
  const deletePerson = useInventoryStore((s) => s.deletePerson);

  const me = members.find((m) => m.userId === currentUserId);
  const isOwner = me?.role === "owner";

  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Person | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<Member | null>(null);
  const [removePersonTarget, setRemovePersonTarget] = useState<Person | null>(null);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">People</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Household members and managed profiles.</p>
        </div>
        <Button size="sm" onClick={() => setAddPersonOpen(true)}>
          <Icon name="plus" size={14} /> Add person
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-white shadow-sm">
        {people.map((p, i) => {
          const member = p.linkedUserId ? members.find((m) => m.userId === p.linkedUserId) : undefined;
          const isLast = i === people.length - 1 && invites.length === 0;
          return (
            <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${isLast ? "" : "border-b border-border"}`}>
              <Avatar className="size-10">
                {p.avatarPath ? (
                  <AvatarImage src={coverPhotoUrl(p.avatarPath)} alt="" />
                ) : (
                  <AvatarFallback className="bg-brand-100 text-yellow">{p.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
                )}
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body text-ink">
                  {p.displayName} {p.linkedUserId === currentUserId && <span className="text-caption text-muted-foreground">(you)</span>}
                </p>
                <p className="truncate text-caption text-muted-foreground">{member ? member.email : PERSON_RELATIONSHIP_LABEL[p.relationship]}</p>
              </div>
              <span className="rounded-full bg-surface-muted px-2 py-1 text-micro font-medium uppercase tracking-wide text-ink">
                {member ? member.role : "Managed"}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" aria-label={`Edit ${p.displayName}`} onClick={() => setEditTarget(p)}>
                  <Icon name="edit" size={14} />
                </Button>
                {member ? (
                  isOwner &&
                  member.userId !== currentUserId && (
                    <>
                      <Button variant="ghost" size="icon-sm" aria-label="Transfer ownership" onClick={() => setTransferTarget(member)}>
                        <Icon name="key" size={14} />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Remove member" onClick={() => setRemoveMemberTarget(member)}>
                        <Icon name="close" size={14} className="text-danger" />
                      </Button>
                    </>
                  )
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${p.displayName}`} onClick={() => setRemovePersonTarget(p)}>
                    <Icon name="close" size={14} className="text-danger" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
        {invites.map((inv, i) => (
          <div key={inv.id} className={`flex items-center gap-3 px-4 py-3 ${i === invites.length - 1 ? "" : "border-b border-border"}`}>
            <div className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-muted-foreground">
              <Icon name="user" size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-ink">{inv.invitedEmail}</p>
              <p className="text-caption text-muted-foreground">Invite pending</p>
            </div>
            {isOwner && (
              <Button variant="ghost" size="sm" onClick={() => cancelInvite(inv.id)}>
                Cancel
              </Button>
            )}
          </div>
        ))}
      </div>

      {me && households.length > 1 && (
        <button
          type="button"
          onClick={() => setLeaveOpen(true)}
          className="tap-target rounded-xl border border-border bg-white py-3 text-center text-body font-medium text-danger shadow-sm"
        >
          Leave Household
        </button>
      )}

      <AddPersonSheet
        open={addPersonOpen}
        onOpenChange={setAddPersonOpen}
        // Nothing to do here beyond letting the sheet add the row itself —
        // this page already re-renders from `people` (real-time/optimistic
        // state), unlike the ownership pickers that use this callback to
        // select the newly created person.
        onCreated={() => {}}
        canInvite={isOwner}
      />

      <EditPersonSheet
        person={editTarget}
        allowRename={!editTarget?.linkedUserId}
        open={!!editTarget}
        onOpenChange={(open) => !open && setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!removeMemberTarget}
        onOpenChange={(open) => !open && setRemoveMemberTarget(null)}
        tone="danger"
        icon="danger"
        title={`Remove ${removeMemberTarget?.displayName}?`}
        description="This immediately revokes their access to the household inventory."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeMemberTarget) {
            removeMember(removeMemberTarget.userId);
            toast.success(`Removed ${removeMemberTarget.displayName}`);
          }
        }}
      />

      <ConfirmDialog
        open={!!removePersonTarget}
        onOpenChange={(open) => !open && setRemovePersonTarget(null)}
        tone="danger"
        icon="danger"
        title={`Remove ${removePersonTarget?.displayName}?`}
        description="This removes their managed profile. Anything they owned becomes a household item — nothing is deleted."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removePersonTarget) {
            deletePerson(removePersonTarget.id);
            toast.success(`Removed ${removePersonTarget.displayName}`);
          }
        }}
      />

      <ConfirmDialog
        open={!!transferTarget}
        onOpenChange={(open) => !open && setTransferTarget(null)}
        tone="default"
        icon="key"
        title={`Make ${transferTarget?.displayName} the Owner?`}
        description="You'll become a Member. Ownership can only be transferred, not shared."
        confirmLabel="Transfer Ownership"
        onConfirm={() => {
          if (transferTarget) {
            transferOwnership(transferTarget.userId);
            toast.success(`${transferTarget.displayName} is now the Owner`);
          }
        }}
      />

      <ConfirmDialog
        open={leaveOpen}
        onOpenChange={setLeaveOpen}
        tone={isOwner ? "default" : "danger"}
        icon={isOwner ? "key" : "danger"}
        title={isOwner ? "Transfer ownership first" : "Leave this household?"}
        description={
          isOwner
            ? "You're the Owner — transfer ownership to another member (use the key icon next to their name above) before you can leave."
            : "You'll lose access to this household's inventory immediately. You can rejoin later with a new invite."
        }
        confirmLabel={isOwner ? "Got it" : "Leave"}
        onConfirm={async () => {
          if (isOwner) return;
          const result = await leaveHousehold();
          if (result.ok) {
            toast.success("You've left the household");
            router.push("/settings");
          } else {
            toast.error(result.error ?? "Couldn't leave the household.");
          }
        }}
      />
    </div>
  );
}

function EditPersonSheet({
  person,
  allowRename,
  open,
  onOpenChange,
}: {
  person: Person | null;
  /** false for a linked member's own Person row — their display name belongs to them (edited via Settings' own name editor, not here); true for a managed profile, which has no other identity source of truth. */
  allowRename: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const updatePerson = useInventoryStore((s) => s.updatePerson);
  const setPersonAvatar = useInventoryStore((s) => s.setPersonAvatar);
  const removePersonAvatar = useInventoryStore((s) => s.removePersonAvatar);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [relationship, setRelationship] = useState<PersonRelationship>("other");
  const [uploading, setUploading] = useState(false);

  // Re-seed local state when the target Person changes, adjusted during
  // render (not in an effect) so it lands before the first paint — see
  // AddPersonSheet's identical pattern for the fuller rationale.
  const [prevPersonId, setPrevPersonId] = useState<string | null>(person?.id ?? null);
  if (person && person.id !== prevPersonId) {
    setPrevPersonId(person.id);
    setDisplayName(person.displayName);
    setRelationship(person.relationship);
  }

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !person) return;
    setUploading(true);
    const result = await setPersonAvatar(person.id, file);
    setUploading(false);
    if (!result.ok) toast.error(result.error ?? "Couldn't upload photo.");
  }

  function handleSave() {
    if (!person) return;
    updatePerson(person.id, allowRename ? { displayName: displayName.trim() || person.displayName, relationship } : { relationship });
    toast.success("Updated");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Edit {person?.displayName ?? "person"}</SheetTitle>
        </SheetHeader>
        {person && (
          <div className="flex flex-col gap-4 px-4 pb-6">
            <div className="flex items-center gap-3">
              <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
              <button type="button" onClick={() => photoInputRef.current?.click()} aria-label="Change photo" className="shrink-0">
                <Avatar className="size-16">
                  {person.avatarPath ? (
                    <AvatarImage src={coverPhotoUrl(person.avatarPath)} alt="" />
                  ) : (
                    <AvatarFallback className="text-item-title">{person.displayName.charAt(0).toUpperCase()}</AvatarFallback>
                  )}
                </Avatar>
              </button>
              <div className="flex flex-col items-start gap-0.5">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading}
                  className="text-caption font-medium text-ink underline underline-offset-2"
                >
                  {uploading ? "Uploading…" : person.avatarPath ? "Change photo" : "Add a photo"}
                </button>
                {person.avatarPath && (
                  <button
                    type="button"
                    onClick={() => removePersonAvatar(person.id)}
                    className="text-caption text-muted-foreground underline underline-offset-2"
                  >
                    Remove photo
                  </button>
                )}
              </div>
            </div>

            {allowRename && (
              <div>
                <label className="mb-1 block text-caption text-muted-foreground">Name</label>
                <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-11" />
              </div>
            )}

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

            <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSave}>
              Save
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
