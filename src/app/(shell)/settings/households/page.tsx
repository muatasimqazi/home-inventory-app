"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function MyHouseholdsPage() {
  const router = useRouter();
  const households = useInventoryStore((s) => s.households);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const switchHousehold = useInventoryStore((s) => s.switchHousehold);
  // The only real per-action async gap in this app outside initial boot —
  // switching to a household with no cached snapshot yet (store.ts's
  // switchHousehold) does a genuine network round-trip with nothing on
  // this page indicating it, and the previous version fired the success
  // toast immediately rather than awaiting the switch, so it could claim
  // success before the switch had actually finished.
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">My Households</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Switch between households you belong to, or set up another one.</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {households.map((h) => {
          const active = h.id === currentHouseholdId;
          const switching = switchingTo === h.id;
          return (
            <button
              key={h.id}
              type="button"
              disabled={switchingTo !== null}
              onClick={async () => {
                if (active) return;
                setSwitchingTo(h.id);
                await switchHousehold(h.id);
                setSwitchingTo(null);
                toast.success(`Switched to ${h.name}`);
              }}
              className={cn(
                "flex items-center gap-3 rounded-2xl border p-4 text-left shadow-sm disabled:opacity-50",
                active ? "border-yellow bg-brand-100" : "border-border bg-white"
              )}
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-yellow">
                {switching ? <Icon name="spinner" size={20} className="animate-spin text-white" /> : <Icon name="box" size={20} className="text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-ink">{h.name}</p>
                <p className="text-caption text-muted-foreground">{switching ? "Switching…" : active ? "Current household" : "Tap to switch"}</p>
              </span>
              {active && <Icon name="check" size={18} className="shrink-0 text-ink" />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2">
        <Button size="lg" onClick={() => router.push("/household-setup")}>
          Create a new household
        </Button>
        <Button size="lg" variant="outline" onClick={() => router.push("/household-setup?mode=join")}>
          I have an invite code
        </Button>
      </div>
    </div>
  );
}
