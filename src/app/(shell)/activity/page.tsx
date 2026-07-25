"use client";

import { useState } from "react";
import { ActivityRow } from "@/components/activity-row";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import type { ActivityEntityType } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { value: ActivityEntityType | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "item", label: "Items" },
  { value: "container", label: "Containers" },
  { value: "location", label: "Locations" },
  { value: "member", label: "Members" },
];

export default function ActivityFeedPage() {
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  const [filter, setFilter] = useState<ActivityEntityType | "all">("all");

  const filtered = filter === "all" ? activity : activity.filter((a) => a.entityType === filter);

  const groups = groupByDay(filtered);

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
