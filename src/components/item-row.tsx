import Link from "next/link";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ItemRowProps {
  item: Item;
  breadcrumbLabel: string;
  /** When set, the row is a selection toggle (a <button>) instead of a navigation link — used by bulk-select flows (e.g. Container detail page). `selected` only matters while this is set. */
  onToggleSelect?: () => void;
  selected?: boolean;
}

/** Row layout for an item list — same data as ItemCard, styled like Settings' row list (docs/bugs.md #12) as an alternative to the card grid. Keeps the real photo thumbnail (unlike EntityRow's generic icon chip) since that's the one piece of per-item visual identity worth preserving in a compact row. */
export function ItemRow({ item, breadcrumbLabel, onToggleSelect, selected }: ItemRowProps) {
  const content = (
    <>
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={!!selected}
          readOnly
          className="size-4 shrink-0"
          aria-label={`Select ${item.name}`}
        />
      )}
      <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={item.coverPhotoPath} className="size-10 shrink-0" emojiClassName="text-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-ink">{item.name}</p>
        <p className="truncate text-caption text-muted-foreground">
          {item.category} · {breadcrumbLabel}
        </p>
      </div>
      {!onToggleSelect && item.needsReview && <Icon name="needsReview" size={16} className="shrink-0 text-ink" />}
      {!onToggleSelect && <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />}
    </>
  );

  const rowClassName = cn(
    "tap-target flex items-center gap-3 rounded-2xl border bg-white px-3 py-2 shadow-sm",
    selected ? "border-ink ring-1 ring-ink" : "border-border"
  );

  if (onToggleSelect) {
    return (
      <button type="button" onClick={onToggleSelect} className={cn(rowClassName, "w-full text-left")}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/items/${item.id}`} className={rowClassName}>
      {content}
    </Link>
  );
}
