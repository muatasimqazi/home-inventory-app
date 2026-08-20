"use client";

import { ContainerCard } from "@/components/container-card";
import type { Container } from "@/lib/types";

interface ContainerCarouselEntry {
  container: Container;
  itemCount: number;
  breadcrumbLabel: string;
  status: { label: string; dotClassName: string } | null;
}

/**
 * Horizontal snap carousel of container cards. Used to scale the card
 * nearest the viewport center up (and ease the rest back down) as a
 * "focus" effect while scrolling — removed after real use made it read
 * as inconsistent card sizing rather than an intentional effect (the
 * per-card scale factor is exactly what produced visibly different
 * widths/heights across cards in the same row). Every card is now a
 * fixed, uniform size regardless of scroll position.
 */
export function ContainerCarousel({ entries }: { entries: ContainerCarouselEntry[] }) {
  return (
    <div className="scrollbar-hide -mx-5 -mb-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-pl-5 px-5 pt-2 pb-8 md:mx-0 md:mb-0 md:scroll-pl-0 md:px-0">
      {entries.map((entry) => (
        <div key={entry.container.id} className="shrink-0 snap-start">
          <ContainerCard
            container={entry.container}
            itemCount={entry.itemCount}
            breadcrumbLabel={entry.breadcrumbLabel}
            status={entry.status}
            className="w-42"
          />
        </div>
      ))}
    </div>
  );
}
