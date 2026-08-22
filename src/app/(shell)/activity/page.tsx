"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ActivityRow } from "@/components/activity-row";
import { EmptyState } from "@/components/empty-state";
import { LoadMoreButton } from "@/components/load-more-button";
import { usePaginated } from "@/hooks/use-paginated";
import { useInventoryStore } from "@/lib/store";
import type { ActivityEntityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const FINANCE_ENTITY_TYPES: ActivityEntityType[] = ["account", "transaction", "category", "recurring_bill"];

type DomainFilter = "all" | "inventory" | "finance";

const FILTERS: { value: DomainFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "inventory", label: "Inventory" },
  { value: "finance", label: "Finance" },
];

/**
 * One shared Activity feed, not two — previously the top-level page here
 * only showed inventory entity types, with a separate /finance/activity
 * filtered to finance ones. Unlike Trash's merge (kept as two panels
 * behind tabs, since each domain's rows carry different destructive
 * actions), Activity is a pure browse/read surface with one shared
 * underlying table (activity_log) already — a real combined timeline is
 * more useful than forcing an artificial split, so this defaults to
 * "All" and offers Inventory/Finance as a simple domain-level filter
 * rather than the old per-entity-type chips (Items/Containers/Locations/
 * Members would have doubled to 8+ chips combined with Finance's own
 * four; a high-level domain filter reads better than that many chips).
 */
export default function ActivityFeedPage() {
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  const markActivityViewed = useInventoryStore((s) => s.markActivityViewed);
  const searchParams = useSearchParams();

  // Bell badge (Overview page) reads each member's last-viewed watermark —
  // stamp it the moment this feed is opened, not on scroll/dismiss, so
  // simply visiting clears the count the same way opening an inbox does.
  useEffect(() => {
    markActivityViewed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Deep-linkable (?domain=inventory|finance) so each domain's own
  // "Activity" link lands pre-filtered, same reasoning as Trash's ?tab=.
  const [filter, setFilter] = useState<DomainFilter>(() => {
    const param = searchParams.get("domain");
    return param === "finance" || param === "inventory" ? param : "all";
  });

  const filtered =
    filter === "all"
      ? activity
      : filter === "finance"
        ? activity.filter((a) => FINANCE_ENTITY_TYPES.includes(a.entityType))
        : activity.filter((a) => !FINANCE_ENTITY_TYPES.includes(a.entityType));

  // Sorted here (not left to groupByDay's own internal sort) so pagination
  // windows the same chronological order the feed actually renders in,
  // rather than an arbitrary pre-sort slice of `filtered`. Reset key is
  // the domain filter — the only thing that changes what's in `filtered`.
  const sortedActivity = [...filtered].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { visible: paginatedActivity, hasMore, remaining, pageSize, loadMore } = usePaginated(sortedActivity, filter);
  const groups = groupByDay(paginatedActivity);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-screen-title font-medium text-ink">Activity</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
              filter === f.value ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon="activity" title="No activity yet" description="Everything anyone does in this household shows up here." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([day, entries]) => (
            <div key={day} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="mb-1 text-caption font-medium text-muted-foreground">{day}</p>
              <div className="divide-y divide-border">
                {entries.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} members={members} />
                ))}
              </div>
            </div>
          ))}
          {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
        </div>
      )}
    </div>
  );
}

function groupByDay<T extends { createdAt: string }>(entries: T[]): [string, T[]][] {
  const sorted = [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const map = new Map<string, T[]>();
  for (const entry of sorted) {
    const day = new Date(entry.createdAt).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    const list = map.get(day) ?? [];
    list.push(entry);
    map.set(day, list);
  }
  return Array.from(map.entries());
}
