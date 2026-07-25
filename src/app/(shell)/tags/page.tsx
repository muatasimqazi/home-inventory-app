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
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-white shadow-sm md:hidden">
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-screen-title font-medium text-ink">Tags</h1>
        <div className="size-9 md:hidden" />
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="tag" title="No tags yet" description="Tags picked up from AI capture or added manually will show up here." />
      ) : (
        <div className="rounded-xl bg-white shadow-sm">
          {rows.map(({ tag, count }, i) => (
            <Link
              key={tag.id}
              href={`/tags/${tag.id}`}
              className={`tap-target flex items-center gap-3 px-4 py-3 ${i === rows.length - 1 ? "" : "border-b border-border"}`}
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-surface-muted text-ink">
                <Icon name="tag" size={16} />
              </span>
              <p className="min-w-0 flex-1 truncate text-body text-ink">{tag.name}</p>
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
