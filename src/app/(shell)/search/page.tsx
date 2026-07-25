"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { categoryAccentClass } from "@/lib/category";
import { useInventoryStore } from "@/lib/store";
import { searchItems } from "@/lib/search";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const tags = useInventoryStore((s) => s.tags);

  const results = useMemo(
    () => searchItems(query, items, containers, locations, tags),
    [query, items, containers, locations, tags]
  );

  const filteredResults = categoryFilter ? results.filter((r) => r.item.category === categoryFilter) : results;
  const usedCategories = Array.from(new Set(results.map((r) => r.item.category)));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <SearchBar value={query} onChange={setQuery} autoFocus className="flex-1" />
      </div>

      {usedCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip label="All" active={categoryFilter === null} onClick={() => setCategoryFilter(null)} />
          {usedCategories.map((cat) => (
            <FilterChip key={cat} label={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)} />
          ))}
        </div>
      )}

      {query.trim() === "" ? (
        <EmptyState
          icon="search"
          title="Search your home"
          description="Try an item name, a category, or a location like “garage.”"
        />
      ) : filteredResults.length === 0 ? (
        <EmptyState
          icon="search"
          title={`No matches for "${query}"`}
          description="Check the spelling, or try a broader term — searches also match categories, tags, and locations."
        />
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-2">
            {filteredResults.map((r) => (
              <Link
                key={r.item.id}
                href={`/items/${r.item.id}`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-surface-muted">
                  <Icon name="box" size={20} className="text-ink" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-item-title font-medium text-ink">{r.item.name}</p>
                  <p className="truncate text-caption text-muted-foreground">{r.breadcrumbLabel}</p>
                </div>
                <span className={cn("h-1 w-6 shrink-0 rounded-full", categoryAccentClass(r.item.category))} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
        active ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
      )}
    >
      {label}
    </button>
  );
}
