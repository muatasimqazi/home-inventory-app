"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { activeLocations } from "@/lib/selectors";
import { REFERENCE_LOCATIONS } from "@/lib/reference/starter-inventory";
import { cn } from "@/lib/utils";
import type { Location } from "@/lib/types";

interface ContainerWizardSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "location" | "container";

/**
 * The Overview page's "+" chooser's "Container" option used to just
 * navigate to /locations (or straight to the one existing Location) and
 * leave the user to find "Add Container" themselves. This is the real
 * guided flow instead: pick or create a Location, then create the
 * container in it, then land straight on that new container's own detail
 * page — the same place "Add items here"/"Add manually" already live, so
 * the whole point of creating a container (put things in it) is one tap
 * away rather than a second navigation the user has to figure out.
 *
 * Same "keep the picker's own Sheet mounted, hide it while a create-form
 * sub-sheet is up" pattern MoveSheet already established for its own
 * inline "New location"/"New container" flows — reused here rather than
 * MoveSheet itself, since MoveSheet's job (pick an existing destination,
 * with creation as a side option) is a different shape than this wizard's
 * (always ends by creating a brand-new container, never picking an
 * existing one).
 *
 * No back-navigation between steps in this first version — closing and
 * reopening restarts the wizard (auto-skipping step 1 again if there's
 * still only one Location). A real "back" would need its own header UI
 * EntityFormSheet doesn't have a slot for; not worth building for a
 * two-step flow yet.
 */
export function ContainerWizardSheet({ open, onOpenChange }: ContainerWizardSheetProps) {
  const router = useRouter();
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const createLocation = useInventoryStore((s) => s.createLocation);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const setLocationCoverPhoto = useInventoryStore((s) => s.setLocationCoverPhoto);
  const setContainerCoverPhoto = useInventoryStore((s) => s.setContainerCoverPhoto);

  const [step, setStep] = useState<Step>("location");
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);

  // Re-derived fresh every time the wizard is freshly opened — it stays
  // mounted with `open` as a prop (Radix pattern used throughout this
  // app), so without this a second "Container" tap would silently resume
  // wherever the last run left off. Render-time prevOpen comparison, not
  // an effect (this app's react-hooks/set-state-in-effect convention —
  // see add-person-sheet.tsx for the same pattern).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      // Exactly one Location already exists — same shortcut the old
      // "Container" chooser row used, still genuinely "select a Location"
      // (there's only one to select), just without an extra tap for it.
      if (locations.length === 1) {
        setSelectedLocation(locations[0]);
        setStep("container");
      } else {
        setSelectedLocation(null);
        setStep("location");
      }
      setAddLocationOpen(false);
    }
  }

  const existingLocationNames = new Set(locations.map((l) => l.name.trim().toLowerCase()));
  const locationSuggestions = REFERENCE_LOCATIONS.filter((name) => !existingLocationNames.has(name.toLowerCase()));

  async function handleCreateLocation({ name, description, photoFile }: { name: string; description: string; photoFile?: File | null }) {
    const loc = createLocation({ name, description: description || undefined });
    // Advance to step 2 before awaiting the photo upload, not after —
    // EntityFormSheet's own handleSubmit calls onOpenChange(false)
    // (addLocationOpen -> false) right after this function is *called*,
    // without awaiting it. If `step` were still "location" at that
    // moment (i.e. this line ran after an await), the step-1 picker's
    // open condition (open && step==="location" && !addLocationOpen)
    // would briefly flip back to true — the picker flashing back open
    // for however long the photo upload takes, before flipping to step 2.
    setSelectedLocation(loc);
    setStep("container");
    if (photoFile) {
      const result = await setLocationCoverPhoto(loc.id, photoFile);
      if (!result.ok) toast.error(result.error ?? "Location saved, but the photo couldn't be uploaded.");
    }
  }

  async function handleCreateContainer({ name, description, photoFile }: { name: string; description: string; photoFile?: File | null }) {
    if (!selectedLocation) return;
    const container = createContainer({ name, description: description || undefined, locationId: selectedLocation.id });
    if (photoFile) {
      const result = await setContainerCoverPhoto(container.id, photoFile);
      if (!result.ok) toast.error(result.error ?? "Container saved, but the photo couldn't be uploaded.");
    }
    toast.success(`Added ${container.name}`);
    onOpenChange(false);
    router.push(`/containers/${container.id}`);
  }

  return (
    <>
      <Sheet open={open && step === "location" && !addLocationOpen} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Which Location?</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button
              type="button"
              onClick={() => setAddLocationOpen(true)}
              className="tap-target flex items-center gap-2 rounded-lg py-2.5 pr-3 text-left text-body font-medium text-yellow hover:bg-surface-muted/60"
            >
              <Icon name="plus" size={16} /> New location
            </button>
            {locations.length === 0 && (
              <p className="px-3 py-2 text-caption text-muted-foreground">No locations yet — create your first one above.</p>
            )}
            {locations.map((loc) => (
              <button
                key={loc.id}
                type="button"
                onClick={() => {
                  setSelectedLocation(loc);
                  setStep("container");
                }}
                className={cn(
                  "tap-target flex items-center gap-2 rounded-lg py-2.5 pr-3 text-left text-body text-ink hover:bg-surface-muted/60"
                )}
              >
                <Icon name="box" size={16} className="text-muted-foreground" />
                {loc.name}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <EntityFormSheet
        open={open && addLocationOpen}
        onOpenChange={setAddLocationOpen}
        title="New location"
        namePlaceholder="e.g. Garage"
        nameSuggestions={locationSuggestions}
        onSubmit={handleCreateLocation}
      />

      <EntityFormSheet
        key={selectedLocation?.id ?? "none"}
        open={open && step === "container"}
        onOpenChange={(o) => {
          if (!o) onOpenChange(false);
        }}
        title={selectedLocation ? `New container in ${selectedLocation.name}` : "New container"}
        namePlaceholder="e.g. Toolbox"
        onSubmit={handleCreateContainer}
      />
    </>
  );
}
