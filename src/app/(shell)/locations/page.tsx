"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { EntityFormSheet } from "@/components/entity-form-sheet";
import { LocationAccordionRow } from "@/components/location-tree";
import { PhotoThumb } from "@/components/photo-thumb";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForLocation, activeLocations } from "@/lib/selectors";
import { useRemountKey } from "@/hooks/use-remount-key";
import { REFERENCE_LOCATIONS } from "@/lib/reference/starter-inventory";
import { stockLocationPhotoUrl } from "@/lib/stock-location-photos";

export default function LocationsListPage() {
  const searchParams = useSearchParams();
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const createLocation = useInventoryStore((s) => s.createLocation);
  const setLocationCoverPhoto = useInventoryStore((s) => s.setLocationCoverPhoto);
  // Deep-link (?open=new) so the new global "+" chooser (Overview page) can
  // land straight on an open Add Location sheet — same convention
  // finance/transactions/page.tsx already established for its own ?open=new.
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("open") === "new");
  const [createKey, bumpCreateKey] = useRemountKey();
  const [openLocationId, setOpenLocationId] = useState<string | null>(null);
  const [openContainerIds, setOpenContainerIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const filteredLocations = query.trim()
    ? locations.filter((loc) => loc.name.toLowerCase().includes(query.trim().toLowerCase()))
    : locations;

  function openCreate() {
    bumpCreateKey();
    setCreateOpen(true);
  }

  // Starter-inventory reference list (docs/Household Ledger Implementation
  // Plan's deferred spreadsheet-import workstream), minus whatever this
  // household already has (case-insensitive) — no point suggesting
  // "Kitchen" again once they've already added one.
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
        <div className="flex items-center gap-2">
          <BackButton hideOnDesktop />
          <div>
            <h1 className="text-screen-title font-semibold text-ink">Locations</h1>
            <p className="mt-0.5 text-caption text-muted-foreground">Browse household storage areas.</p>
          </div>
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
          {locations.length > 8 && <SearchBar value={query} onChange={setQuery} placeholder="Search locations…" className="mb-2" />}

          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="browse">Browse</TabsTrigger>
          </TabsList>

          <TabsContent value="list">
            {filteredLocations.length === 0 ? (
              <EmptyState icon="search" title={`No locations match "${query.trim()}"`} description="Check the spelling or try a different word." />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredLocations.map((loc) => {
                  const itemCount = activeItemCountForLocation(items, loc.id);
                  return (
                    <Link
                      key={loc.id}
                      href={`/locations/${loc.id}`}
                      className="flex items-stretch gap-3 overflow-hidden rounded-2xl border border-border bg-white shadow-sm"
                    >
                      {/* Edge-to-edge top-to-bottom (and flush left) — the
                          photo has no padding of its own; the text side keeps
                          its own py-3.5 pr-4.
                          relative+w-16 wrapper, PhotoThumb absolutely
                          positioned to fill it — a plain width-only
                          className left height unconstrained, so img's
                          size-full (height:100% of an auto-height parent)
                          fell back to the source photo's own aspect ratio:
                          a tall original photo rendered as a tall row, a
                          wide one as a short row, no two rows the same
                          height. Same fix entity-card.tsx already uses for
                          its own aspect-ratio boxes. */}
                      <div className="relative w-16 shrink-0">
                        {/* rounded-r-none — PhotoThumb's own rounded-2xl
                            rounds all 4 corners by default, right for a
                            card's own edges but wrong here: this photo only
                            sits at the card's left edge, its right edge
                            butts up against the text, not a corner. */}
                        <PhotoThumb
                          emoji={loc.coverPhotoEmoji ?? "📍"}
                          coverPhotoPath={loc.coverPhotoPath ?? stockLocationPhotoUrl(loc.name)}
                          className="absolute inset-0 size-full rounded-r-none"
                          emojiClassName="text-2xl"
                          fit="cover"
                        />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center gap-3 py-3.5 pr-4">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-item-title font-medium text-ink">{loc.name}</p>
                          <p className="truncate text-caption text-muted-foreground">
                            {itemCount} item{itemCount === 1 ? "" : "s"}
                          </p>
                        </div>
                        <span className="shrink-0 text-caption font-semibold text-ink">Open</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="browse">
            {filteredLocations.length === 0 ? (
              <EmptyState icon="search" title={`No locations match "${query.trim()}"`} description="Check the spelling or try a different word." />
            ) : (
              <div className="flex flex-col gap-2">
                {filteredLocations.map((loc) => (
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
            )}
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
