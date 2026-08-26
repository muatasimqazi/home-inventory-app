"use client";

import { useState } from "react";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { ItemCard } from "@/components/item-card";
import { SearchBar } from "@/components/search-bar";
import { useInventoryStore } from "@/lib/store";
import { buildBreadcrumb, breadcrumbLabel } from "@/lib/selectors";

export default function FavoritesPage() {
  const items = useInventoryStore((s) => s.items);
  const favorites = useInventoryStore((s) => s.favorites);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const locations = useInventoryStore((s) => s.locations);
  const containers = useInventoryStore((s) => s.containers);

  const favoriteIds = new Set(favorites.filter((f) => f.userId === currentUserId).map((f) => f.itemId));
  const favoriteItems = items.filter((it) => it.status === "active" && favoriteIds.has(it.id));
  const [query, setQuery] = useState("");
  const filteredItems = query.trim()
    ? favoriteItems.filter((it) => it.name.toLowerCase().includes(query.trim().toLowerCase()))
    : favoriteItems;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <h1 className="text-screen-title font-medium text-ink">Favorites</h1>
      </div>

      {favoriteItems.length === 0 ? (
        <EmptyState icon="heart" title="No favorites yet" description="Tap the heart on any item to keep it one tap away." />
      ) : (
        <>
          {favoriteItems.length > 8 && <SearchBar value={query} onChange={setQuery} placeholder="Search favorites…" />}
          {filteredItems.length === 0 ? (
            <EmptyState icon="search" title={`No favorites match "${query.trim()}"`} description="Check the spelling or try a different word." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {filteredItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
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
