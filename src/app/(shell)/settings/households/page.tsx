"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";

export default function MyHouseholdsPage() {
  const router = useRouter();
  const households = useInventoryStore((s) => s.households);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const switchHousehold = useInventoryStore((s) => s.switchHousehold);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">My Households</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Switch between households you belong to, or set up another one.</p>
      </div>

      <div className="flex flex-col gap-2">
        {households.map((h) => {
          const active = h.id === currentHouseholdId;
          return (
            <button
              key={h.id}
              type="button"
              onClick={() => {
                if (active) return;
                switchHousehold(h.id);
                toast.success(`Switched to ${h.name}`);
              }}
              className={
                active
                  ? "flex items-center gap-3 rounded-2xl border border-yellow bg-brand-100 p-4 text-left shadow-sm"
                  : "flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left shadow-sm"
              }
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-yellow">
                <Icon name="box" size={20} className="text-white" />
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate text-body font-semibold text-ink">{h.name}</p>
                <p className="text-caption text-muted-foreground">{active ? "Current household" : "Tap to switch"}</p>
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
