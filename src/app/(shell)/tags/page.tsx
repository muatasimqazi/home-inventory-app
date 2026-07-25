"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import { tagItemCounts } from "@/lib/selectors";

export default function TagsPage() {
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const tags = useInventoryStore((s) => s.tags);
  const rows = tagItemCounts(items, tags);

  return (
    <div className="flex flex-col gap-5 pb-6">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm md:hidden">
        <Icon name="arrowLeft" size={18} />
      </button>
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Tags</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Browse items by label.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="tag" title="No tags yet" description="Tags picked up from AI capture or added manually will show up here." />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ tag, count }) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.id}`}
              className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white px-4 py-3 shadow-sm"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-100">
                <Icon name="tag" size={16} className="text-yellow" />
              </span>
              <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{tag.name}</p>
              <span className="text-caption text-muted-foreground">
                {count} item{count === 1 ? "" : "s"}
              </span>
              <Icon name="chevronRight" size={16} className="text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
