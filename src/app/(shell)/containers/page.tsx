"use client";

import { useState } from "react";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { EntityRow } from "@/components/entity-row";
import { SearchBar } from "@/components/search-bar";
import { useInventoryStore } from "@/lib/store";
import { activeContainers, activeItemCountForContainer, breadcrumbLabel, buildBreadcrumb } from "@/lib/selectors";
import { cn } from "@/lib/utils";

type OccupancyFilter = "all" | "occupied" | "empty";

/**
 * "Containers" — every Container across every Location, flattened into one
 * list. Containers already existed (they're the physical storage bin
 * itself: QR/NFC label, cover photo, nested under a Location — see
 * lib/types.ts's Container), but had no page of their own; the only way to
 * reach one was drilling into a Location first (locations/[id]'s Browse
 * tab) or already having its direct link. This is the flat, top-level,
 * filterable entry point for "what containers do I have and which ones
 * are actually holding anything" — same list/search shape as
 * locations/page.tsx, filtered by occupancy instead of by name alone.
 */
export default function ContainersListPage() {
  const locations = useInventoryStore((s) => s.locations);
  const containers = activeContainers(useInventoryStore((s) => s.containers));
  const items = useInventoryStore((s) => s.items);

  const [query, setQuery] = useState("");
  const [occupancy, setOccupancy] = useState<OccupancyFilter>("all");

  const withCounts = containers.map((c) => ({ container: c, count: activeItemCountForContainer(items, containers, c.id) }));

  const trimmedQuery = query.trim().toLowerCase();
  const filtered = withCounts
    .filter(({ container }) => !trimmedQuery || container.name.toLowerCase().includes(trimmedQuery))
    .filter(({ count }) => (occupancy === "occupied" ? count > 0 : occupancy === "empty" ? count === 0 : true))
    .sort((a, b) => a.container.name.localeCompare(b.container.name));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Containers</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Every storage container across your household.</p>
        </div>
      </div>

      {containers.length === 0 ? (
        <EmptyState
          icon="archive"
          title="No containers yet"
          description="Containers are the bins, boxes & drawers inside a Location — add one from any Location page."
        />
      ) : (
        <>
          {containers.length > 8 && <SearchBar value={query} onChange={setQuery} placeholder="Search containers…" />}

          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterChip label="All" active={occupancy === "all"} onClick={() => setOccupancy("all")} />
            <FilterChip label="Has items" active={occupancy === "occupied"} onClick={() => setOccupancy("occupied")} />
            <FilterChip label="Empty" active={occupancy === "empty"} onClick={() => setOccupancy("empty")} />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon="search"
              title={trimmedQuery ? `No containers match "${query.trim()}"` : "No containers match this filter"}
              description="Check the spelling, or try a different filter."
            />
          ) : (
            <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              {filtered.map(({ container, count }) => {
                // Path down to (not including) this container itself —
                // same slice(0, -1)-of-its-own-breadcrumb shape
                // containers/[id]/page.tsx already renders, just built
                // directly off the parent rather than sliced off the full
                // path.
                const path = breadcrumbLabel(buildBreadcrumb(container.locationId, container.parentContainerId ?? null, locations, containers));
                return (
                  <EntityRow
                    key={container.id}
                    href={`/containers/${container.id}`}
                    icon="archive"
                    emoji={container.coverPhotoEmoji ?? "📦"}
                    coverPhotoPath={container.coverPhotoPath}
                    title={container.name}
                    subtitle={`${path} · ${count} item${count === 1 ? "" : "s"}`}
                    className="px-3"
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
        active ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink"
      )}
    >
      {label}
    </button>
  );
}
