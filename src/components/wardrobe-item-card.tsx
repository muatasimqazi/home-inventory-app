"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PhotoThumb } from "@/components/photo-thumb";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { categoryAccentClass } from "@/lib/category";
import type { Item, ItemStudioPhoto } from "@/lib/types";
import { cn } from "@/lib/utils";

interface WardrobeItemCardProps {
  item: Item;
  studioPhotos: ItemStudioPhoto[];
  breadcrumbLabel: string;
  className?: string;
}

/**
 * The Wardrobe catalog page's card — same outer shell as the general-
 * purpose ItemCard (aspect-145/92 photo box, rounded-xl bg-white p-3
 * shadow-sm, name/breadcrumb below, category accent bar), but the photo
 * box holds a swipeable strip of every photo this item has (its own
 * cover photo, then each completed Studio-generated style) instead of
 * one static image — the actual "ecommerce, see how it looks" ask.
 * Hand-rolled scroll-snap, same CSS technique container-carousel.tsx
 * already uses elsewhere in this app — no carousel library installed or
 * needed. A single-photo item (no studio photos generated yet) renders
 * exactly like a plain ItemCard: one static image, no dots, no scroll.
 */
export function WardrobeItemCard({ item, studioPhotos, breadcrumbLabel, className }: WardrobeItemCardProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // The item's own original cover photo used to always lead this list,
  // followed by the generated styles — but Ghost Mannequin's own prompt
  // explicitly falls back to "a clean product shot on a pure white
  // background" for anything that isn't a worn garment (see
  // generate-studio-photo.ts), which can come back close enough to the
  // plain original photo that the two read as duplicates side by side — a
  // real, reported bug. Once any style has been generated, show only the
  // generated styles (Ghost Mannequin first when present, then whichever
  // others the user picked in WardrobeStudioSheet, in the order they were
  // generated) — never the raw original alongside them. Falls back to just
  // the cover photo, single-image, for an item that hasn't been through
  // the Studio yet.
  const completeStudioPhotos = studioPhotos
    .filter((p) => p.status === "complete" && p.generatedPhotoPath)
    .sort((a, b) => {
      if (a.style === "ghost_mannequin" && b.style !== "ghost_mannequin") return -1;
      if (b.style === "ghost_mannequin" && a.style !== "ghost_mannequin") return 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
  const photoPaths =
    completeStudioPhotos.length > 0
      ? completeStudioPhotos.map((p) => p.generatedPhotoPath!)
      : item.coverPhotoPath
        ? [item.coverPhotoPath]
        : [];

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || el.clientWidth === 0) return;
    setActiveIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <Link href={`/items/${item.id}`} className={cn("flex flex-col overflow-hidden rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-lg", className)}>
      <div className="relative aspect-145/92 w-full overflow-hidden rounded-lg">
        {photoPaths.length > 1 ? (
          <>
            <div
              ref={scrollerRef}
              onScroll={handleScroll}
              className="scrollbar-hide flex size-full snap-x snap-mandatory overflow-x-auto"
            >
              {photoPaths.map((path, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={path + i} src={coverPhotoUrl(path)} alt={item.name} className="size-full shrink-0 snap-center object-cover" loading="lazy" />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex items-center justify-center gap-1">
              {photoPaths.map((_, i) => (
                <span key={i} className={cn("size-1.5 rounded-full", i === activeIndex ? "bg-white" : "bg-white/50")} />
              ))}
            </div>
          </>
        ) : (
          <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={item.coverPhotoPath} label={item.category} className="absolute inset-0 size-full" fit="cover" />
        )}
      </div>
      <p className="mt-2 truncate text-item-title font-medium text-ink">{item.name}</p>
      <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
      <span className={cn("mt-2 h-1 w-7 rounded-full", categoryAccentClass(item.category))} />
    </Link>
  );
}
