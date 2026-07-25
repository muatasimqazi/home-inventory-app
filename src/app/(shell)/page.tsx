"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { BinCard } from "@/components/bin-card";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import {
  activeContainers,
  activeLocations,
  buildBreadcrumb,
  breadcrumbLabel,
  computeHouseholdSummary,
  containerStatusFlags,
  genericPhotoItemCount,
  looseItemCount,
} from "@/lib/selectors";

const ONBOARDING_THRESHOLD = 5;

export default function DashboardPage() {
  const router = useRouter();
  const household = useInventoryStore((s) => s.household);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);

  const activeItems = items.filter((it) => it.status === "active");
  const activeContainerList = activeContainers(containers);
  const recentContainers = [...activeContainerList].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const summary = computeHouseholdSummary(items, locations);
  const loose = looseItemCount(items);
  const genericPhotos = genericPhotoItemCount(items);
  const latestActivity = activity[0];
  const actor = latestActivity ? members.find((m) => m.userId === latestActivity.actorUserId) : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-100">
            <Icon name="home" size={22} className="text-yellow" />
          </span>
          <div>
            <p className="text-caption font-medium text-muted-foreground">Household</p>
            <p className="text-screen-title font-semibold text-ink">{household.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/add" aria-label="Add item" className="tap-target flex size-11 items-center justify-center rounded-xl bg-yellow text-white shadow-lg">
            <Icon name="plus" size={20} />
          </Link>
          <Link href="/activity" aria-label="Activity" className="tap-target relative flex size-11 items-center justify-center rounded-xl border border-border bg-white">
            <Icon name="bell" size={20} className="text-ink" />
          </Link>
        </div>
      </div>

      <SearchBar value="" onChange={() => {}} onFocus={() => router.push("/search")} />

      <div className="flex h-11 items-center justify-between rounded-[10px] border border-border bg-white px-4 text-caption font-semibold">
        <span className="text-muted-foreground">
          {summary.totalActiveItems} item{summary.totalActiveItems === 1 ? "" : "s"}
        </span>
        <span className="text-ink">
          {activeContainerList.length} bin{activeContainerList.length === 1 ? "" : "s"}
        </span>
        <span className="text-ink">
          {summary.needsReviewCount} review
        </span>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Next up</p>
            <p className="mt-1 text-item-title font-semibold text-ink">Action queue</p>
            <p className="mt-1 text-caption text-muted-foreground">Quick checks that keep the inventory accurate.</p>
          </div>
          <Link
            href="/review"
            className="tap-target flex h-11 shrink-0 items-center justify-center rounded-xl bg-yellow px-4 text-caption font-semibold text-white"
          >
            Open
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionChip label="Review" count={summary.needsReviewCount} tone="purple" />
          <ActionChip label="Photos" count={genericPhotos} tone="green" />
          <ActionChip label="Loose" count={loose} tone="orange" />
        </div>
      </div>

      <section aria-label="Storage bins" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-semibold text-ink">Storage bins</h2>
          <Link href="/locations" className="text-caption font-semibold text-ink">
            View all
          </Link>
        </div>

        {recentContainers.length === 0 ? (
          <EmptyState
            icon="camera"
            title="Start cataloging your home"
            description="Capture a few items and Shohaz will remember exactly where they live."
            action={
              <Link
                href="/capture"
                className="tap-target inline-flex h-11 items-center justify-center rounded-full bg-yellow px-6 text-body font-medium text-white"
              >
                Scan item
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {recentContainers.map((container) => {
              const flags = containerStatusFlags(items, containers, container.id);
              const itemCount = items.filter((it) => it.status === "active" && it.containerId === container.id).length;
              const status = flags.needsReview
                ? { label: "Review", dotClassName: "bg-badge-purple-text" }
                : flags.genericPhoto
                  ? { label: "Photo", dotClassName: "bg-yellow" }
                  : null;
              return (
                <BinCard
                  key={container.id}
                  container={container}
                  itemCount={itemCount}
                  breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(container.locationId, container.parentContainerId ?? null, locations, containers))}
                  status={status}
                />
              );
            })}
          </div>
        )}
      </section>

      {activeItems.length < ONBOARDING_THRESHOLD ? null : latestActivity ? (
        <Link
          href="/activity"
          className="flex items-center justify-between rounded-[10px] border border-border bg-white px-4 py-3 text-caption"
        >
          <span className="truncate text-muted-foreground">
            {actor?.displayName ?? "Someone"} {latestActivity.action} {latestActivity.entityName}
          </span>
          <span className="shrink-0 font-semibold text-ink">View</span>
        </Link>
      ) : null}
    </div>
  );
}

const CHIP_TONES = {
  purple: "bg-badge-purple-bg text-badge-purple-text",
  green: "bg-badge-green-bg text-badge-green-text",
  orange: "bg-badge-orange-bg text-badge-orange-text",
} as const;

function ActionChip({ label, count, tone }: { label: string; count: number; tone: keyof typeof CHIP_TONES }) {
  return (
    <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold ${CHIP_TONES[tone]}`}>
      {label}
      <span>{count}</span>
    </span>
  );
}
