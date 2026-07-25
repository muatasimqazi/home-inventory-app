"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useInventoryStore } from "@/lib/store";
import type { Member } from "@/lib/types";

export default function HouseholdMembersPage() {
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const invites = useInventoryStore((s) => s.invites);
  const inviteMember = useInventoryStore((s) => s.inviteMember);
  const cancelInvite = useInventoryStore((s) => s.cancelInvite);
  const removeMember = useInventoryStore((s) => s.removeMember);
  const transferOwnership = useInventoryStore((s) => s.transferOwnership);

  const me = members.find((m) => m.userId === currentUserId);
  const isOwner = me?.role === "owner";

  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [transferTarget, setTransferTarget] = useState<Member | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-screen-title font-medium text-ink">Household Members</h1>
        {isOwner && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <Icon name="plus" size={14} /> Invite
          </Button>
        )}
      </div>

      <div className="rounded-xl bg-white shadow-sm">
        {members.map((m, i) => (
          <div key={m.userId} className={`flex items-center gap-3 px-4 py-3 ${i === members.length - 1 && invites.length === 0 ? "" : "border-b border-border"}`}>
            <div className="flex size-10 items-center justify-center rounded-full bg-surface-muted text-body font-medium text-ink">
              {m.displayName.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body text-ink">
                {m.displayName} {m.userId === currentUserId && <span className="text-caption text-muted-foreground">(you)</span>}
              </p>
              <p className="truncate text-caption text-muted-foreground">{m.email}</p>
            </div>
            <span className="rounded-full bg-surface-muted px-2 py-1 text-micro font-medium uppercase tracking-wide text-ink">{m.role}</span>
            {isOwner && m.userId !== currentUserId && (
              <div className="flex gap-1">
                <Button variant="ghost" size="icon-sm" aria-label="Transfer ownership" onClick={() => setTransferTarget(m)}>
                  <Icon name="key" size={14} />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label="Remove member" onClick={() => setRemoveTarget(m)}>
                  <Icon name="close" size={14} className="text-danger" />
                </Button>
              </div>
            )}
          </div>
        ))}
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

      <Sheet open={inviteOpen} onOpenChange={setInviteOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Invite a member</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="h-11" autoFocus />
            <Button
              size="lg"
              onClick={() => {
                if (!email.trim()) return;
                inviteMember(email.trim());
                toast.success(`Invite sent to ${email.trim()}`);
                setEmail("");
                setInviteOpen(false);
              }}
            >
              Send invite
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        tone="danger"
        icon="danger"
        title={`Remove ${removeTarget?.displayName}?`}
        description="This immediately revokes their access to the household inventory."
        confirmLabel="Remove"
        onConfirm={() => {
          if (removeTarget) {
            removeMember(removeTarget.userId);
            toast.success(`Removed ${removeTarget.displayName}`);
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
    </div>
  );
}
