"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { LocationAccordionRow } from "@/components/location-tree";
import { PhotoThumb } from "@/components/photo-thumb";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForLocation, activeLocations } from "@/lib/selectors";
import { useRemountKey } from "@/hooks/use-remount-key";
import { REFERENCE_LOCATIONS } from "@/lib/reference/up-home-inventory";

export default function LocationsListPage() {
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const createLocation = useInventoryStore((s) => s.createLocation);
  const setLocationCoverPhoto = useInventoryStore((s) => s.setLocationCoverPhoto);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, bumpCreateKey] = useRemountKey();
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  const [openContainerIds, setOpenContainerIds] = useState<Set<string>>(new Set());

  function openCreate() {
    bumpCreateKey();
    setCreateOpen(true);
  }

  // United Policyholders reference list (docs/Household Ledger
  // Implementation Plan's deferred spreadsheet-import workstream), minus
  // whatever this household already has (case-insensitive) — no point
  // suggesting "Kitchen" again once they've already added one.
  const existingLocationNames = new Set(locations.map((l) => l.name.trim().toLowerCase()));
  const locationSuggestions = REFERENCE_LOCATIONS.filter((name) => !existingLocationNames.has(name.toLowerCase()));

  function toggleContainer(id: string) {
    setOpenContainerIds((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Locations</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Browse household storage areas.</p>
        </div>
        <Button size="icon-lg" className="rounded-md" onClick={openCreate} aria-label="Add location">
          <Icon name="plus" size={18} />
        </Button>
      </div>

      {locations.length === 0 ? (
        <EmptyState
          icon="box"
          title="No locations yet"
          description="Locations are the top-level places you store things — Garage, Attic, Office."
          action={
            <Button size="lg" onClick={openCreate}>
              Add a location
            </Button>
          }
        />
      ) : (
        <Tabs defaultValue="list">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="browse">Browse</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            <div className="flex flex-col gap-2">
              {locations.map((loc) => {
                const itemCount = activeItemCountForLocation(items, loc.id);
                return (
                  <Link
                    key={loc.id}
                    href={`/locations/${loc.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3.5 shadow-sm"
                  >
                    <PhotoThumb
                      emoji={loc.coverPhotoEmoji ?? "📍"}
                      coverPhotoPath={loc.coverPhotoPath}
                      className="size-10 shrink-0 rounded-[10px]"
                      emojiClassName="text-lg"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-item-title font-medium text-ink">{loc.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="shrink-0 text-caption font-semibold text-ink">Open</span>
                  </Link>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="browse">
            <div className="flex flex-col gap-2">
              {locations.map((loc) => (
                <LocationAccordionRow
                  key={loc.id}
                  location={loc}
                  containers={containers}
                  items={items}
                  isOpen={openLocationId === loc.id}
                  onToggle={() => setOpenLocationId((cur) => (cur === loc.id ? null : loc.id))}
                  openContainerIds={openContainerIds}
                  onToggleContainer={toggleContainer}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <EntityFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Add Location"
        namePlaceholder="e.g. Garage"
        nameSuggestions={locationSuggestions}
        onSubmit={async ({ name, description, photoFile }) => {
          const loc = createLocation({ name, description });
          if (photoFile) {
            const result = await setLocationCoverPhoto(loc.id, photoFile);
            if (!result.ok) toast.error(result.error ?? "Location saved, but the photo couldn't be uploaded.");
          }
          toast.success(`Added ${loc.name}`);
        }}
      />
    </div>
  );
}
