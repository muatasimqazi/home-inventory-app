"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/item-card";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel, genericPhotoItemCount } from "@/lib/selectors";

/**
 * Active items still on the generic 📦 placeholder photo emoji — the
 * Overview page's "Needs attention" → Photos chip (dashboard/page.tsx's
 * needsAttentionChips) used to show this exact count with no destination
 * at all (a plain, unclickable span; every other chip already links
 * somewhere real — Review → /review, Loose → /unassigned, Bills →
 * /finance/recurring). Same flat grid + tap-through-to-fix-on-the-item's-
 * own-page shape as /unassigned, just filtered on photoEmoji instead of
 * on a missing Location/Container.
 */
export default function NeedsPhotosPage() {
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const genericPhotoItems = items.filter((it) => it.status === "active" && it.photoEmoji === "📦");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <h1 className="text-screen-title font-medium text-ink">Needs a photo</h1>
          <p className="text-caption text-muted-foreground">
            {genericPhotoItemCount(items)} item{genericPhotoItemCount(items) === 1 ? "" : "s"} still on the placeholder icon.
          </p>
        </div>
      </div>

      {genericPhotoItems.length === 0 ? (
        <EmptyState icon="camera" title="Every item has a real photo" description="Nothing is still showing the generic placeholder icon." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {genericPhotoItems.map((item) => (
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
