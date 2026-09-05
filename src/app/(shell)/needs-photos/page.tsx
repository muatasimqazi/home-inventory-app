"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/item-card";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel, hasNoRealPhoto } from "@/lib/selectors";

/**
 * Active items with no real photo of their own — the Overview page's
 * "Needs attention" → Photos chip (dashboard/page.tsx's
 * needsAttentionChips) used to show this exact count with no destination
 * at all (a plain, unclickable span; every other chip already links
 * somewhere real — Review → /review, Loose → /unassigned, Bills →
 * /finance/recurring). Same flat grid + tap-through-to-fix-on-the-item's-
 * own-page shape as /unassigned, just filtered on hasNoRealPhoto instead
 * of on a missing Location/Container.
 *
 * hasNoRealPhoto checks coverPhotoPath, not photoEmoji — an earlier
 * version of this filter checked photoEmoji === "📦" directly, which also
 * caught every Miscellaneous item *with* a real uploaded photo (CATEGORY_
 * EMOJI maps that category to "📦" itself, unrelated to whether a real
 * photo exists) — see hasNoRealPhoto's own doc comment.
 */
export default function NeedsPhotosPage() {
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const itemsNeedingPhotos = items.filter((it) => it.status === "active" && hasNoRealPhoto(it));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <div>
          <h1 className="text-screen-title font-medium text-ink">Needs a photo</h1>
          <p className="text-caption text-muted-foreground">
            {itemsNeedingPhotos.length} item{itemsNeedingPhotos.length === 1 ? "" : "s"} with no real photo yet.
          </p>
        </div>
      </div>

      {itemsNeedingPhotos.length === 0 ? (
        <EmptyState icon="camera" title="Every item has a real photo" description="Nothing is still missing a photo of its own." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {itemsNeedingPhotos.map((item) => (
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
