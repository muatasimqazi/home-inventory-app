"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { UtilityRail } from "@/components/utility-rail";
import { ItemCard } from "@/components/item-card";
import { IconChip } from "@/components/icon-chip";
import { EntityRow } from "@/components/entity-row";
import { ReviewBadge } from "@/components/review-badge";
import { EmptyState } from "@/components/empty-state";
import type { IconName } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForLocation, activeLocations, buildBreadcrumb, breadcrumbLabel, computeHouseholdSummary } from "@/lib/selectors";

const ONBOARDING_THRESHOLD = 5;

export default function DashboardPage() {
  const router = useRouter();
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = activeLocations(useInventoryStore((s) => s.locations));

  const activeItems = items.filter((it) => it.status === "active");
  const recentItems = [...activeItems].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const summary = computeHouseholdSummary(items, locations);

  return (
    <div className="flex flex-col gap-6">
      <SearchBar value="" onChange={() => {}} onFocus={() => router.push("/search")} />

      <UtilityRail />

      <section aria-label="Quick links" className="grid grid-cols-3 gap-2">
        <QuickLink href="/locations" icon="box" label="Locations" />
        <QuickLink href="/favorites" icon="heart" label="Favorites" />
        <QuickLink href="/review" icon="needsReview" label="Review" badge={summary.needsReviewCount} />
      </section>

      <section aria-label="Recently added" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-medium text-ink">Recently Added</h2>
          <Link href="/search" className="text-caption font-medium text-ink">
            View all
          </Link>
        </div>

        {activeItems.length < ONBOARDING_THRESHOLD ? (
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
            {recentItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                breadcrumbLabel={breadcrumbLabel(buildBreadcrumb(item.locationId, item.containerId, locations, containers))}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-label="Locations" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-section-title font-medium text-ink">Locations</h2>
          <Link href="/locations" className="text-caption font-medium text-ink">
            View all
          </Link>
        </div>

        {locations.length === 0 ? (
          <EmptyState icon="box" title="No locations yet" description="Add a Garage, Attic, or Office to start organizing." />
        ) : (
          <div className="rounded-xl bg-white p-1.5 shadow-lg">
            {locations.map((loc) => (
              <EntityRow
                key={loc.id}
                href={`/locations/${loc.id}`}
                icon="box"
                title={loc.name}
                subtitle={`${activeItemCountForLocation(items, loc.id)} items`}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function QuickLink({ href, icon, label, badge }: { href: string; icon: IconName; label: string; badge?: number }) {
  return (
    <Link href={href} className="tap-target relative flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-white py-3">
      <IconChip icon={icon} tone="yellow" size="sm" />
      <span className="text-caption font-medium text-ink">{label}</span>
      {badge ? <ReviewBadge count={badge} className="absolute right-2 top-2" /> : null}
    </Link>
  );
}
