"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * Wraps wherever the current household's name is shown (Overview's own
 * heading, the desktop sidebar) with a quick-switch affordance — the
 * only way to switch used to be a full trip to Settings > My
 * Households. Renders as plain, non-interactive text (no chevron, not
 * even a button) when there's nothing to switch to — the common case,
 * one household — so nobody sees a switcher for something they can't
 * actually do anything with.
 *
 * Bottom sheet, not a dropdown menu — matches this app's own established
 * "tap a value, get a sheet with the real options" pattern (e.g.
 * set-household-location-sheet.tsx) rather than introducing this
 * codebase's first-ever dropdown-menu for what's fundamentally the same
 * kind of picker.
 */
export function HouseholdSwitcher({ className, textClassName }: { className?: string; textClassName?: string }) {
  const households = useInventoryStore((s) => s.households);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const switchHousehold = useInventoryStore((s) => s.switchHousehold);
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  const current = households.find((h) => h.id === currentHouseholdId);
  if (!current) return null;

  if (households.length <= 1) {
    return <span className={cn(textClassName, className)}>{current.name}</span>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("flex min-w-0 items-center gap-1", className)}>
        <span className={cn("truncate", textClassName)}>{current.name}</span>
        <Icon name="chevronDown" size={14} className="shrink-0 text-muted-foreground" />
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Switch household</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-2 px-4 pb-6">
            {households.map((h) => {
              const active = h.id === currentHouseholdId;
              const switching = switchingTo === h.id;
              return (
                <button
                  key={h.id}
                  type="button"
                  disabled={switchingTo !== null}
                  onClick={async () => {
                    if (active) {
                      setOpen(false);
                      return;
                    }
                    setSwitchingTo(h.id);
                    await switchHousehold(h.id);
                    setSwitchingTo(null);
                    setOpen(false);
                    toast.success(`Switched to ${h.name}`);
                  }}
                  className={cn(
                    "tap-target flex items-center gap-3 rounded-2xl border p-3 text-left shadow-sm disabled:opacity-50",
                    active ? "border-yellow bg-brand-100" : "border-border bg-card"
                  )}
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-yellow">
                    {switching ? <Icon name="spinner" size={16} className="animate-spin text-white" /> : <Icon name="box" size={16} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">{h.name}</span>
                  {active && <Icon name="check" size={16} className="shrink-0 text-ink" />}
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
