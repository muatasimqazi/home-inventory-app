"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EntityCard } from "@/components/entity-card";
import { EmptyState } from "@/components/empty-state";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForLocation, activeLocations, directChildContainers } from "@/lib/selectors";

export default function LocationsListPage() {
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const createLocation = useInventoryStore((s) => s.createLocation);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-screen-title font-medium text-ink">Locations</h1>
        <Button size="icon" className="rounded-full" onClick={() => setCreateOpen(true)} aria-label="Add location">
          <Icon name="plus" size={18} />
        </Button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon="box"
          title="No locations yet"
          description="Locations are the top-level places you store things — Garage, Attic, Office."
          action={
            <Button size="lg" onClick={() => setCreateOpen(true)}>
              Add a location
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {locations.map((loc) => {
            const containerCount = directChildContainers(containers, null, loc.id).length;
            const itemCount = activeItemCountForLocation(items, loc.id);
            return (
              <EntityCard
                key={loc.id}
                href={`/locations/${loc.id}`}
                emoji={loc.coverPhotoEmoji ?? "📦"}
                title={loc.name}
                subtitle={`${containerCount} container${containerCount === 1 ? "" : "s"} · ${itemCount} item${itemCount === 1 ? "" : "s"}`}
              />
            );
          })}
        </div>
      )}

      <EntityFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Location"
        namePlaceholder="e.g. Garage"
        onSubmit={({ name, description }) => {
          const loc = createLocation({ name, description });
          toast.success(`Added ${loc.name}`);
        }}
      />
    </div>
  );
}
