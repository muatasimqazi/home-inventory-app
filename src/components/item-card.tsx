import Link from "next/link";
import { PhotoThumb } from "@/components/photo-thumb";
import { Icon } from "@/components/icon";
import { categoryAccentClass } from "@/lib/category";
import type { Item } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ItemCardProps {
  item: Item;
  breadcrumbLabel: string;
  className?: string;
  /** When set, the card is a selection toggle (a <button>) instead of a navigation link — used by bulk-select flows (e.g. Container detail page). `selected` only matters while this is set. */
  onToggleSelect?: () => void;
  selected?: boolean;
}

export function ItemCard({ item, breadcrumbLabel, className, onToggleSelect, selected }: ItemCardProps) {
  const content = (
    <>
      <div className="relative">
        <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={item.coverPhotoPath} label={item.category} className="aspect-[145/92] w-full" fit="cover" />
        {onToggleSelect ? (
          <div
            className={cn(
              "absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full border-2 border-white shadow-sm",
              selected ? "bg-ink text-white" : "bg-white/70 text-transparent"
            )}
          >
            <Icon name="check" size={13} />
          </div>
        ) : (
          item.needsReview && (
            <div className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-ink text-white">
              <Icon name="needsReview" size={13} />
            </div>
          )
        )}
      </div>
      <p className="mt-2 truncate text-item-title font-medium text-ink">{item.name}</p>
      <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
      <span className={cn("mt-2 h-1 w-7 rounded-full", categoryAccentClass(item.category))} />
    </>
  );

  const cardClassName = cn(
    "flex flex-col overflow-hidden rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-lg",
    selected && "ring-2 ring-ink",
    className
  );

  if (onToggleSelect) {
    return (
      <button type="button" onClick={onToggleSelect} className={cn(cardClassName, "text-left")}>
        {content}
      </button>
    );
  }

  return (
    <Link href={`/items/${item.id}`} className={cardClassName}>
      {content}
    </Link>
  );
}
