"use client";

import { useState } from "react";
import Link from "next/link";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { WardrobeItemCard } from "@/components/wardrobe-item-card";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel } from "@/lib/selectors";

/**
 * Wardrobe catalog — an ecommerce-style grid of clothing items, each
 * card showing every photo the item has (original + Wardrobe Photo
 * Studio's generated styles) as a swipeable strip (WardrobeItemCard),
 * not just one static cover photo. Same grid convention favorites/
 * page.tsx already establishes (grid-cols-2 / md:grid-cols-4), same
 * one-off inline filter precedent that page uses rather than a new
 * selectors.ts helper for a single call site.
 */
export default function WardrobePage() {
  const items = useInventoryStore((s) => s.items);
  const itemStudioPhotos = useInventoryStore((s) => s.itemStudioPhotos);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const wardrobeItems = items.filter((it) => it.status === "active" && it.category === "Clothing");
  const [query, setQuery] = useState("");
  const filteredItems = query.trim()
    ? wardrobeItems.filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase()))
    : wardrobeItems;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-medium text-ink">Wardrobe</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Your clothing, cataloged.</p>
        </div>
      </div>

      {wardrobeItems.length === 0 ? (
        <EmptyState
          icon="grid"
          title="No wardrobe items yet"
          description="Scan a clothing item to catalog it and generate clean studio photos."
          action={
            <Link href="/capture/wardrobe" className="tap-target inline-flex h-11 items-center justify-center rounded-full bg-yellow px-6 text-body font-medium text-white">
              Scan Wardrobe
            </Link>
          }
        />
      ) : (
        <>
          {wardrobeItems.length > 8 && <SearchBar value={query} onChange={setQuery} placeholder="Search wardrobe…" />}
          {filteredItems.length === 0 ? (
            <EmptyState icon="search" title={`No items match "${query.trim()}"`} description="Check the spelling or try a different word." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {filteredItems.map((item) => (
                <WardrobeItemCard
                  key={item.id}
                  item={item}
                  studioPhotos={itemStudioPhotos.filter((p) => p.itemId === item.id)}
                  breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
