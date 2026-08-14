"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/item-card";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel } from "@/lib/selectors";

/**
 * Items with no Container — either sitting directly in a Location (the
 * Dashboard "Loose" count) or, previously, with no Location either (a
 * dead end nothing linked to, since capture/manual-add both fell back
 * silently to nowhere). This is the one place both are actually visible
 * and actionable — tap through to move any of them.
 */
export default function UnassignedItemsPage() {
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const looseItems = items.filter((it) => it.status === "active" && it.containerId === null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <h1 className="text-screen-title font-medium text-ink">Unassigned items</h1>
          <p className="text-caption text-muted-foreground">Not yet placed in a Container.</p>
        </div>
      </div>

      {looseItems.length === 0 ? (
        <EmptyState icon="box" title="Nothing unassigned" description="Every active item is filed into a Container." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {looseItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
