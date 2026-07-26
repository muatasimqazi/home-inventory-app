"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { activeLocations, directChildContainers } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";

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
  const excluded = excludeContainerIds ? new Set(excludeContainerIds) : null;

  function isCurrent(locationId: string | null, containerId: string | null) {
    return locationId === currentLocationId && containerId === currentContainerId;
  }

  function pick(locationId: string | null, containerId: string | null) {
    onMove({ locationId, containerId });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Move to</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-4 pb-6">
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
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
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
