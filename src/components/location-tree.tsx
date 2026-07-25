"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";
import { binIdBadgeClasses } from "@/lib/badge-color";
import { activeItemCountForLocation, directChildContainers, itemsIn } from "@/lib/selectors";
import type { Container, Item, Location } from "@/lib/types";

interface ContainerNodeProps {
  container: Container;
  locationId: string;
  containers: Container[];
  items: Item[];
  depth: number;
  openIds: Set<string>;
  onToggle: (id: string) => void;
}

/** One container row in the nested browser — recurses into sub-containers, no depth limit. */
function ContainerNode({ container, locationId, containers, items, depth, openIds, onToggle }: ContainerNodeProps) {
  const children = directChildContainers(containers, container.id, locationId);
  const directItemCount = itemsIn(items, locationId, container.id).length;
  const isOpen = openIds.has(container.id);

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1.5" style={{ paddingLeft: `${depth * 18}px` }}>
        {children.length > 0 ? (
          <button
            type="button"
            onClick={() => onToggle(container.id)}
            aria-label={isOpen ? `Collapse ${container.name}` : `Expand ${container.name}`}
            className="tap-target flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          >
            <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={14} className="text-muted-foreground" />
          </button>
        ) : (
          <span className="size-6 shrink-0" />
        )}
        <Link
          href={`/containers/${container.id}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-caption text-ink"
        >
          {container.displayCode && (
            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 font-mono text-micro font-semibold", binIdBadgeClasses(container.id))}>
              {container.displayCode}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{container.name}</span>
          <span className="shrink-0 text-micro text-muted-foreground">{directItemCount} items</span>
        </Link>
      </div>
      {isOpen && children.length > 0 && (
        <div className="ml-3 border-l border-border">
          {children.map((child) => (
            <ContainerNode
              key={child.id}
              container={child}
              locationId={locationId}
              containers={containers}
              items={items}
              depth={depth}
              openIds={openIds}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LocationAccordionRowProps {
  location: Location;
  containers: Container[];
  items: Item[];
  isOpen: boolean;
  onToggle: () => void;
  openContainerIds: Set<string>;
  onToggleContainer: (id: string) => void;
}

/** One expandable Location section — the "one location open at a time" accordion in constrained views. */
export function LocationAccordionRow({
  location,
  containers,
  items,
  isOpen,
  onToggle,
  openContainerIds,
  onToggleContainer,
}: LocationAccordionRowProps) {
  const rootContainers = directChildContainers(containers, null, location.id);
  const directItemCount = itemsIn(items, location.id, null).length;
  const totalItemCount = activeItemCountForLocation(items, location.id);

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm">
      <button type="button" onClick={onToggle} className="tap-target flex w-full items-center gap-3 px-4 py-3 text-left">
        <Icon name={isOpen ? "chevronDown" : "chevronRight"} size={16} className="shrink-0 text-muted-foreground" />
        <span className="text-xl" aria-hidden>
          {location.coverPhotoEmoji ?? "📦"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium text-ink">{location.name}</p>
          <p className="text-caption text-muted-foreground">
            {rootContainers.length} container{rootContainers.length === 1 ? "" : "s"} · {totalItemCount} item{totalItemCount === 1 ? "" : "s"}
          </p>
        </div>
      </button>

      {isOpen && (
        <div className={cn("border-t border-border px-4 py-2", rootContainers.length === 0 && directItemCount === 0 && "py-4")}>
          {rootContainers.length === 0 && directItemCount === 0 ? (
            <EmptyState icon="archive" title="Nothing here yet" className="bg-transparent py-4 shadow-none" />
          ) : (
            <>
              {rootContainers.map((c) => (
                <ContainerNode
                  key={c.id}
                  container={c}
                  locationId={location.id}
                  containers={containers}
                  items={items}
                  depth={0}
                  openIds={openContainerIds}
                  onToggle={onToggleContainer}
                />
              ))}
              {directItemCount > 0 && (
                <Link href={`/locations/${location.id}`} className="mt-1 block py-1.5 text-caption text-muted-foreground hover:text-ink hover:underline">
                  {directItemCount} item{directItemCount === 1 ? "" : "s"} directly in {location.name} →
                </Link>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
