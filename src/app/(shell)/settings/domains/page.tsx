"use client";

import { toast } from "sonner";
import { BackButton } from "@/components/back-button";
import { DomainToggle } from "@/components/domain-toggle";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";

/**
 * Change-it-later counterpart to household-setup's "what do you want to
 * track?" onboarding step (0033_household_domains.sql) — that step was
 * the only place this could ever be set until now, a real lock-in trap
 * for anyone who picked wrong or whose household's needs changed.
 *
 * Owner-only edit, same as every other household-level setting (RLS's
 * "household owner update" on households itself backs this up
 * server-side) — a non-owner still sees the current state, just can't
 * change it, matching settings/members.tsx's own isOwner-gating style.
 */
export default function HouseholdDomainsPage() {
  const household = useCurrentHousehold();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const members = useInventoryStore((s) => s.members);
  const updateHouseholdDomains = useInventoryStore((s) => s.updateHouseholdDomains);
  const isOwner = members.find((m) => m.userId === currentUserId)?.role === "owner";

  async function toggle(patch: { financeEnabled?: boolean; inventoryEnabled?: boolean }) {
    const result = await updateHouseholdDomains(household.id, patch);
    if (!result.ok) toast.error(result.error ?? "Couldn't save that.");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">What this household tracks</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {isOwner ? "Choose one or both — you can't turn both off." : "Only the household owner can change this."}
          </p>
        </div>
      </div>

      <DomainToggle
        icon="box"
        tone="bg-ink"
        title="Inventory"
        description="Catalog what you own — items, locations, containers"
        checked={household.inventoryEnabled}
        disabled={!isOwner}
        onToggle={() => toggle({ inventoryEnabled: !household.inventoryEnabled })}
      />
      <DomainToggle
        icon="trendingUp"
        tone="bg-yellow"
        title="Finance"
        description="Accounts, transactions, budgets & bills"
        checked={household.financeEnabled}
        disabled={!isOwner}
        onToggle={() => toggle({ financeEnabled: !household.financeEnabled })}
      />

      <p className="text-caption text-muted-foreground">
        Turning a domain off hides it from navigation — nothing already saved there is deleted, and turning it back on brings it right back.
      </p>
    </div>
  );
}
