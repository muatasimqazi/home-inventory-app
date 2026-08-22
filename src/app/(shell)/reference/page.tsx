"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { EmptyState } from "@/components/empty-state";
import { REFERENCE_LOCATIONS, loadReferenceItems, type ReferenceInventoryItem } from "@/lib/reference/starter-inventory";

/**
 * Browsable version of the starter-inventory reference catalog (Household
 * Ledger Implementation Plan's deferred spreadsheet-import workstream) —
 * up to now this dataset only surfaced piecemeal, as typeahead suggestions
 * on Add Location (REFERENCE_LOCATIONS) and the manual Add Item form's
 * Name field (loadReferenceItems). This page lets a household look through
 * the whole thing directly: all 22 storage-area buckets with their item
 * counts, drilling into /reference/[location] for the ~40-400 items in
 * each. Deliberately does not hide items the household already owns —
 * same "always show, it's just a reference list" posture as the rest of
 * this batch; precise owned-item dedup needs fuzzy matching against real
 * inventory and isn't worth it here.
 *
 * Loads the full ~220KB item list on mount via loadReferenceItems() — this
 * route only exists to show that data, unlike Add Item's on-focus lazy
 * load, so paying for it immediately here is the right tradeoff. The
 * dynamic import is still what keeps the payload out of any route that
 * hasn't asked for it (see starter-inventory.ts's own header comment).
 */
export default function ReferenceCatalogPage() {
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

  const counts = new Map<string, number>();
  if (items) {
    for (const item of items) counts.set(item.location, (counts.get(item.location) ?? 0) + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Common Items</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">
          Browse a reference catalog of typical household items, organized by storage area.
        </p>
      </div>

      {items === null ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-12 shadow-sm">
          <Icon name="spinner" size={28} className="animate-spin text-ink" />
          <p className="text-body text-ink">Loading catalog…</p>
        </div>
      ) : REFERENCE_LOCATIONS.length === 0 ? (
        <EmptyState icon="box" title="No reference catalog available" />
      ) : (
        <div className="flex flex-col gap-2">
          {REFERENCE_LOCATIONS.map((loc) => {
            const count = counts.get(loc) ?? 0;
            return (
              <Link
                key={loc}
                href={`/reference/${encodeURIComponent(loc)}`}
                className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm"
              >
                <IconChip icon="box" tone="muted" />
                <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{loc}</p>
                <span className="shrink-0 text-caption text-muted-foreground">
                  {count} item{count === 1 ? "" : "s"}
                </span>
                <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
