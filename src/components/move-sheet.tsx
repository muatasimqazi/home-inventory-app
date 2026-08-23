"use client";

import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { activeLocations, directChildContainers } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";
import { REFERENCE_LOCATIONS } from "@/lib/reference/starter-inventory";

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

  // Filters the location/container tree by name (or a container's own
  // display code, e.g. "GAR-234") — the one shared "where does this go"
  // picker every move/add-item flow in the app uses, so a household with
  // many locations/containers had no way to narrow this down besides
  // scrolling a long indented tree. A location or container matches if its
  // own name/code matches OR any descendant does — an ancestor of a real
  // match still renders (un-highlighted, just for path context) even when
  // it doesn't match itself, so "Bin 12" inside "Garage" is still findable
  // and still shows up nested under "Garage," not floating with no context.
  const [query, setQuery] = useState("");
  // Fresh each time the sheet opens — a filter left over from a previous
  // "Move to" on a different item would just be confusing, not a saved
  // preference worth persisting. Deferred a tick (react-hooks/set-state-in-effect,
  // same pattern as desktop-sidebar.tsx's own reconcile-on-mount effect) —
  // the setState shouldn't run synchronously inside the effect body itself.
  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => setQuery(""));
  }, [open]);
  const trimmedQuery = query.trim().toLowerCase();
  const isFiltering = trimmedQuery.length > 0;

  function nameMatches(name: string): boolean {
    return name.toLowerCase().includes(trimmedQuery);
  }

  function containerMatches(container: Container): boolean {
    return nameMatches(container.name) || (!!container.displayCode && container.displayCode.toLowerCase().includes(trimmedQuery));
  }

  // Bottom-up: a container's subtree "has a match" if it matches itself or
  // any child's subtree does.
  const containerSubtreeHasMatch = new Map<string, boolean>();
  function computeSubtreeMatch(container: Container): boolean {
    const cached = containerSubtreeHasMatch.get(container.id);
    if (cached !== undefined) return cached;
    const children = containers.filter((c) => c.status === "active" && c.parentContainerId === container.id);
    const result = containerMatches(container) || children.some(computeSubtreeMatch);
    containerSubtreeHasMatch.set(container.id, result);
    return result;
  }
  containers.forEach(computeSubtreeMatch);

  function locationSubtreeHasMatch(locationId: string, locationName: string): boolean {
    if (!isFiltering) return true;
    if (nameMatches(locationName)) return true;
    return containers.some((c) => c.status === "active" && c.locationId === locationId && c.parentContainerId === null && containerSubtreeHasMatch.get(c.id));
  }

  const visibleLocations = locations.filter((loc) => locationSubtreeHasMatch(loc.id, loc.name));
  // Same starter-inventory suggestion list as Locations' own "Add
  // Location" — this is the other real entry point that creates a
  // Location (a brand-new household reaching this picker with zero
  // locations yet).
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
          <div className="flex flex-col gap-3 px-4 pb-6">
            {locations.length > 0 && (
              <div className="relative">
                <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search locations & containers"
                  aria-label="Search locations and containers"
                  className="tap-target h-11 w-full rounded-xl border border-border bg-white pr-3 pl-10 text-body text-ink outline-none placeholder:text-muted-foreground focus:border-yellow"
                />
              </div>
            )}

            <div className="flex flex-col gap-1">
              <CreateRow label="New location" depth={0} onClick={() => setAddLocationOpen(true)} />
              {locations.length === 0 && (
                <p className="px-3 py-2 text-caption text-muted-foreground">No locations yet — create your first one above.</p>
              )}
              {locations.length > 0 && visibleLocations.length === 0 && (
                <p className="px-3 py-2 text-caption text-muted-foreground">No locations or containers match “{query.trim()}.”</p>
              )}
              {visibleLocations.map((loc) => (
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
                    containerSubtreeHasMatch={isFiltering ? containerSubtreeHasMatch : null}
                  />
                  <CreateRow
                    label={`New container in ${loc.name}`}
                    depth={1}
                    onClick={() => setAddContainerFor({ locationId: loc.id, locationName: loc.name })}
                  />
                </div>
              ))}
            </div>
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
  containerSubtreeHasMatch,
}: {
  locationId: string;
  parentId: string | null;
  depth: number;
  containers: Container[];
  isCurrent: (locationId: string | null, containerId: string | null) => boolean;
  onPick: (locationId: string | null, containerId: string | null) => void;
  excluded: Set<string> | null;
  /** Non-null while actively searching (move-sheet.tsx's own bottom-up map) — a container renders only if it or a descendant matches the query. Null (not filtering) shows the full tree, unchanged. */
  containerSubtreeHasMatch: Map<string, boolean> | null;
}) {
  const children = directChildContainers(containers, parentId, locationId)
    .filter((c) => !excluded?.has(c.id))
    .filter((c) => !containerSubtreeHasMatch || containerSubtreeHasMatch.get(c.id));
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
            containerSubtreeHasMatch={containerSubtreeHasMatch}
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
