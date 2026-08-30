"use client";

import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { activeLocations } from "@/lib/selectors";
import {
  REFERENCE_LOCATIONS,
  loadReferenceItems,
  matchReferenceLocation,
  type ReferenceInventoryItem,
} from "@/lib/reference/starter-inventory";

/**
 * Detail drill-down for one reference-catalog storage area (see
 * ../page.tsx's header comment). The location is a bundled reference
 * string, not a DB record with an id, so it's carried in the URL via
 * encodeURIComponent/decodeURIComponent (Next.js decodes the dynamic
 * segment automatically) rather than a lookup id — matches how ../page.tsx
 * links here.
 *
 * Each item's "+" routes to /add, prefilling name + category, and also
 * locationId when this household already has a real Location whose name
 * matches this reference location — reusing matchReferenceLocation()
 * exactly as the manual Add Item form already does for its own
 * suggestions, just in the reverse direction (reference location -> real
 * location instead of real location -> reference location).
 */
export default function ReferenceLocationDetailPage() {
  const params = useParams<{ location: string }>();
  const router = useRouter();
  const locationName = decodeURIComponent(params.location);
  const locations = useInventoryStore((s) => s.locations);

  const [items, setItems] = useState<ReferenceInventoryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadReferenceItems().then((loaded) => {
      if (!cancelled) setItems(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!REFERENCE_LOCATIONS.includes(locationName)) return notFound();

  // activeLocations() — not the raw store slice — since a trashed
  // Location's id has no business being handed to /add as a destination;
  // every other placement-facing use of `locations` in this app already
  // filters this way (locations/page.tsx, move-sheet.tsx, search/page.tsx's
  // own reverse-match for "Common items", ...).
  const matchedLocation = activeLocations(locations).find((l) => matchReferenceLocation(l.name) === locationName) ?? null;
  const locationItems = items?.filter((item) => item.location === locationName) ?? null;

  function addHref(item: ReferenceInventoryItem) {
    const p = new URLSearchParams({ name: item.name, category: item.category });
    if (matchedLocation) p.set("locationId", matchedLocation.id);
    return `/add?${p.toString()}`;
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm"
          aria-label="Back"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">{locationName}</h1>
        <div className="size-9" />
      </div>

      {locationItems === null ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-12 shadow-sm">
          <Icon name="spinner" size={28} className="animate-spin text-ink" />
          <p className="text-body text-ink">Loading catalog…</p>
        </div>
      ) : locationItems.length === 0 ? (
        <EmptyState icon="box" title="No reference items for this area" />
      ) : (
        <div className="flex flex-col gap-2">
          {locationItems.map((item) => (
            <div
              key={item.name}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-ink">{item.name}</p>
                <p className="truncate text-caption text-muted-foreground">{item.category}</p>
              </div>
              <Button asChild size="icon" variant="outline" className="shrink-0 rounded-full" aria-label={`Add ${item.name}`}>
                <Link href={addHref(item)}>
                  <Icon name="plus" size={16} />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
