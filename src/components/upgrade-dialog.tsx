"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useCurrentHousehold, useInventoryStore } from "@/lib/store";

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the user was trying to do, e.g. "Connecting a bank account" — leads the dialog's copy. */
  feature: string;
}

/**
 * The "let them try, then paywall" pattern's UI half — every gated action
 * (Plaid bank sync, email receipt forwarding) stays visible and
 * clickable for a Free household; this is what shows instead of actually
 * doing the thing. Not the real enforcement on its own — the matching
 * server-side requireHouseholdPlan() check (lib/authorize.ts) is what
 * actually stops the request; this is just so the user finds out clearly
 * instead of the action silently failing.
 *
 * Billing is household-level and owner-managed (see settings/billing's
 * own comment) — a non-owner member hitting a gated action can't start
 * checkout themselves, so this shows a "ask the owner" message instead of
 * a button that would just 403.
 */
export function UpgradeDialog({ open, onOpenChange, feature }: UpgradeDialogProps) {
  const household = useCurrentHousehold();
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const isOwner = members.find((m) => m.userId === currentUserId)?.role === "owner";
  const [loading, setLoading] = useState(false);

  async function handleUpgrade() {
    setLoading(true);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: household.id, tier: "plus" }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start checkout.");
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          <div className="flex size-11 items-center justify-center rounded-full bg-brand-100 text-yellow">
            <Icon name="lock" size={20} />
          </div>
          <DialogTitle className="text-section-title font-medium text-ink">{feature} needs Plus</DialogTitle>
          <DialogDescription className="text-body text-muted-foreground">
            {isOwner
              ? `Upgrade ${household.name} to Plus to unlock this, plus AI-assisted capture and email receipt forwarding.`
              : `${feature} is a Plus feature. Ask the household owner to upgrade to unlock it.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-auto" onClick={() => onOpenChange(false)} disabled={loading}>
            {isOwner ? "Not now" : "Okay"}
          </Button>
          {isOwner && (
            <Button size="lg" className="flex-auto bg-yellow text-white hover:bg-yellow/90" onClick={handleUpgrade} disabled={loading}>
              {loading ? <Icon name="spinner" size={16} className="animate-spin" /> : "Upgrade to Plus"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
