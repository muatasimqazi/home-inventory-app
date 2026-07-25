"use client";

import { notFound, useParams, useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel, itemsForTag } from "@/lib/selectors";

export default function TagDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tags = useInventoryStore((s) => s.tags);
  const items = useInventoryStore((s) => s.items);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const tag = tags.find((t) => t.id === params.id);
  if (!tag) return notFound();

  const taggedItems = itemsForTag(items, tag.id);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-medium text-ink">#{tag.name}</h1>
        <div className="size-9" />
      </div>

      {taggedItems.length === 0 ? (
        <EmptyState icon="tag" title="No items with this tag" />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {taggedItems.map((item) => (
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
