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
}

export function ItemCard({ item, breadcrumbLabel, className }: ItemCardProps) {
  return (
    <Link
      href={`/items/${item.id}`}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-lg",
        className
      )}
    >
      <div className="relative">
        <PhotoThumb emoji={item.photoEmoji} label={item.category} className="aspect-[145/92] w-full" />
        {item.needsReview && (
          <div className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-ink text-white">
            <Icon name="needsReview" size={13} />
          </div>
        )}
      </div>
      <p className="mt-2 truncate text-item-title font-medium text-ink">{item.name}</p>
      <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
      <span className={cn("mt-2 h-1 w-7 rounded-full", categoryAccentClass(item.category))} />
    </Link>
  );
}
