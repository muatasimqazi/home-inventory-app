"use client";

import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { activeLocations } from "@/lib/selectors";

interface CreateChooserSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ChooserRow({ icon, label, description, onClick }: { icon: IconName; label: string; description: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 text-left">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-yellow text-white">
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{label}</p>
        <p className="truncate text-caption text-muted-foreground">{description}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </button>
  );
}

/**
 * The Overview page's top "+" used to link straight to /add (a new
 * inventory item) — with two real domains and five real "create" targets
 * now (item, location, container, transaction, account), that guess is
 * wrong more often than it's right. Same "explicit chooser, not a
 * classifier" posture as ScanChooserSheet (the camera FAB's own equivalent
 * sheet): the user always taps what they mean before landing on a form.
 *
 * Location and Transaction land straight on an already-open create sheet
 * (?open=new — the same deep-link convention finance/transactions/page.tsx
 * already established, now also wired into finance/accounts/page.tsx and
 * locations/page.tsx). Container is the one genuine exception: a container
 * always belongs to a real Location, so there's no context-free "create a
 * container" destination to deep-link into. When the household has exactly
 * one Location, this skips straight to it (its detail page's own "Add
 * Container" button is right there); otherwise it lands on the Locations
 * list to choose one first — an honest extra step for a case that
 * genuinely needs it, not a missing feature.
 */
export function CreateChooserSheet({ open, onOpenChange }: CreateChooserSheetProps) {
  const router = useRouter();
  // activeLocations() applied to the raw selector result, not an inline
  // .filter() inside the selector itself — a selector returning a new
  // array on every call breaks Zustand's useSyncExternalStore snapshot
  // comparison and causes an infinite render loop (this codebase's own
  // display-code-sheet.tsx has a comment on this exact pitfall). This
  // component is unconditionally mounted on the Overview page (only its
  // Sheet's `open` prop toggles visibility), so getting this wrong crashed
  // that page outright rather than just this sheet.
  const locations = activeLocations(useInventoryStore((s) => s.locations));

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  function goCreateContainer() {
    if (locations.length === 1) {
      go(`/locations/${locations[0].id}`);
    } else {
      go("/locations");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Add</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-2 px-4 pb-6">
          <ChooserRow icon="box" label="Item" description="Add something to your inventory" onClick={() => go("/add")} />
          <ChooserRow icon="pin" label="Location" description="A room or area you store things in" onClick={() => go("/locations?open=new")} />
          <ChooserRow
            icon="archive"
            label="Container"
            description={locations.length === 0 ? "You'll need a Location first" : "A bin, box, or shelf inside a Location"}
            onClick={goCreateContainer}
          />
          <ChooserRow
            icon="receipt"
            label="Transaction"
            description="A purchase, payment, or transfer"
            onClick={() => go("/finance/transactions?open=new")}
          />
          <ChooserRow icon="wallet" label="Account" description="A bank, card, or investment account" onClick={() => go("/finance/accounts?open=new")} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
