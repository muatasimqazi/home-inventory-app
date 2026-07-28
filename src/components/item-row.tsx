import Link from "next/link";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import type { Item } from "@/lib/types";

interface ItemRowProps {
  item: Item;
  breadcrumbLabel: string;
}

/** Row layout for an item list — same data as ItemCard, styled like Settings' row list (docs/bugs.md #12) as an alternative to the card grid. Keeps the real photo thumbnail (unlike EntityRow's generic icon chip) since that's the one piece of per-item visual identity worth preserving in a compact row. */
export function ItemRow({ item, breadcrumbLabel }: ItemRowProps) {
  return (
    <Link href={`/items/${item.id}`} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white px-3 py-2 shadow-sm">
      <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={item.coverPhotoPath} className="size-10 shrink-0" emojiClassName="text-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{item.name}</p>
        <p className="truncate text-caption text-muted-foreground">
          {item.category} · {breadcrumbLabel}
        </p>
      </div>
      {item.needsReview && <Icon name="needsReview" size={16} className="shrink-0 text-ink" />}
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
