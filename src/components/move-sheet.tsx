"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { activeLocations, directChildContainers } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";
import { REFERENCE_LOCATIONS } from "@/lib/reference/up-home-inventory";

interface MoveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentLocationId: string | null;
  currentContainerId: string | null;
  onMove: (dest: { locationId: string | null; containerId: string | null }) => void;
  /** When moving a container itself, pass its id + all descendant ids so the sheet can't offer them as destinations — picking one would create a cycle. Not needed when moving an item. */
  excludeContainerIds?: string[];
}

export function MoveSheet({ open, onOpenChange, currentLocationId, currentContainerId, onMove, excludeContainerIds }: MoveSheetProps) {
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const containers = useInventoryStore((s) => s.containers);
  const createLocation = useInventoryStore((s) => s.createLocation);
  const createContainer = useInventoryStore((s) => s.createContainer);
  const excluded = excludeContainerIds ? new Set(excludeContainerIds) : null;
  // Same UP reference suggestion list as Locations' own "Add Location" —
  // this is the other real entry point that creates a Location (a
  // brand-new household reaching this picker with zero locations yet).
  const existingLocationNames = new Set(locations.map((l) => l.name.trim().toLowerCase()));
  const locationSuggestions = REFERENCE_LOCATIONS.filter((name) => !existingLocationNames.has(name.toLowerCase()));

  // Household Ledger Implementation Plan §11's flagged gap: a brand-new
  // household has zero locations, so the picker below had nothing to show
  // and no way to add one — the exact dead end PRD §14's "type a name, it
  // gets created" onboarding step was supposed to prevent, except that
  // step was never wired into the actual capture flow. Fixed here, once,
  // in the shared picker every "where does this go" call site already
  // uses, rather than as a capture-flow-specific workaround.
  //
  // Reuses the existing EntityFormSheet (same one Add Location / Add
  // Container already use elsewhere) instead of a bespoke inline input —
  // one sub-sheet at a time, so the picker's own Sheet is hidden (not
  // unmounted — `open` stays true) while a create form is up, and
  // reappears automatically on cancel.
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addContainerFor, setAddContainerFor] = useState<{ locationId: string; locationName: string } | null>(null);

  function isCurrent(locationId: string | null, containerId: string | null) {
    return locationId === currentLocationId && containerId === currentContainerId;
  }

  function pick(locationId: string | null, containerId: string | null) {
    onMove({ locationId, containerId });
    onOpenChange(false);
  }

  function handleCreateLocation({ name, description }: { name: string; description: string }) {
    const loc = createLocation({ name, description: description || undefined });
    pick(loc.id, null);
  }

  function handleCreateContainer({ name, description }: { name: string; description: string }) {
    if (!addContainerFor) return;
    const c = createContainer({ name, description: description || undefined, locationId: addContainerFor.locationId });
    pick(addContainerFor.locationId, c.id);
  }

  return (
    <>
      <Sheet open={open && !addLocationOpen && !addContainerFor} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">Move to</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <CreateRow label="New location" depth={0} onClick={() => setAddLocationOpen(true)} />
            {locations.length === 0 && (
              <p className="px-3 py-2 text-caption text-muted-foreground">No locations yet — create your first one above.</p>
            )}
            {locations.map((loc) => (
              <div key={loc.id} className="flex flex-col">
                <DestinationRow
                  label={loc.name}
                  selected={isCurrent(loc.id, null)}
                  onClick={() => pick(loc.id, null)}
                  depth={0}
                />
                <ContainerBranch
                  locationId={loc.id}
                  parentId={null}
                  depth={1}
                  containers={containers}
                  isCurrent={isCurrent}
                  onPick={pick}
                  excluded={excluded}
                />
                <CreateRow
                  label={`New container in ${loc.name}`}
                  depth={1}
                  onClick={() => setAddContainerFor({ locationId: loc.id, locationName: loc.name })}
                />
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      <EntityFormSheet
        open={addLocationOpen}
        onOpenChange={setAddLocationOpen}
        title="New location"
        namePlaceholder="e.g. Garage"
        nameSuggestions={locationSuggestions}
        onSubmit={handleCreateLocation}
      />

      <EntityFormSheet
        key={addContainerFor?.locationId ?? "none"}
        open={addContainerFor !== null}
        onOpenChange={(o) => {
          if (!o) setAddContainerFor(null);
        }}
        title={addContainerFor ? `New container in ${addContainerFor.locationName}` : "New container"}
        namePlaceholder="e.g. Bin 12"
        onSubmit={handleCreateContainer}
      />
    </>
  );
}

function ContainerBranch({
  locationId,
  parentId,
  depth,
  containers,
  isCurrent,
  onPick,
  excluded,
}: {
  locationId: string;
  parentId: string | null;
  depth: number;
  containers: Container[];
  isCurrent: (locationId: string | null, containerId: string | null) => boolean;
  onPick: (locationId: string | null, containerId: string | null) => void;
  excluded: Set<string> | null;
}) {
  const children = directChildContainers(containers, parentId, locationId).filter((c) => !excluded?.has(c.id));
  if (children.length === 0) return null;
  return (
    <>
      {children.map((c) => (
        <div key={c.id}>
          <DestinationRow label={c.name} selected={isCurrent(locationId, c.id)} onClick={() => onPick(locationId, c.id)} depth={depth} />
          <ContainerBranch
            locationId={locationId}
            parentId={c.id}
            depth={depth + 1}
            containers={containers}
            isCurrent={isCurrent}
            onPick={onPick}
            excluded={excluded}
          />
        </div>
      ))}
    </>
  );
}

function DestinationRow({
  label,
  selected,
  onClick,
  depth,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  depth: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 12 + depth * 20 }}
      className={cn(
        "tap-target flex items-center justify-between rounded-lg py-2.5 pr-3 text-left text-body",
        selected ? "bg-surface-muted font-medium text-ink" : "text-ink hover:bg-surface-muted/60"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon name={depth === 0 ? "box" : "archive"} size={16} className="text-muted-foreground" />
        {label}
      </span>
      {selected && <Icon name="check" size={16} />}
    </button>
  );
}

function CreateRow({ label, depth, onClick }: { label: string; depth: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ paddingLeft: 12 + depth * 20 }}
      className="tap-target flex items-center gap-2 rounded-lg py-2.5 pr-3 text-left text-body font-medium text-yellow hover:bg-surface-muted/60"
    >
      <Icon name="plus" size={16} />
      {label}
    </button>
  );
}
