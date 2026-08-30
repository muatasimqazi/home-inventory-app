"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { ActivityRow } from "@/components/activity-row";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import { activeItemCountForLocation, activeLocations, computeHouseholdSummary } from "@/lib/selectors";

export default function DesktopActivityDashboardPage() {
  const items = useInventoryStore((s) => s.items);
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  const invites = useInventoryStore((s) => s.invites);

  const summary = computeHouseholdSummary(items, locations);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-desktop-title font-medium text-ink">Activity Dashboard</h1>
          <p className="text-body text-muted-foreground">A management-oriented overview of the whole household inventory.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon="box" label="Active items" value={summary.totalActiveItems} href="/search" />
        <StatTile icon="needsReview" label="Needs review" value={summary.needsReviewCount} href="/review" tone={summary.needsReviewCount > 0 ? "attention" : "default"} />
        <StatTile icon="trash" label="Expiring in Trash" value={summary.trashExpiringSoonCount} href="/trash" tone={summary.trashExpiringSoonCount > 0 ? "attention" : "default"} />
        <StatTile icon="users" label="Members" value={members.length + invites.length} href="/settings/members" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title font-medium text-ink">Recent activity</h2>
            <Link href="/activity" className="text-caption font-medium text-ink">
              View all
            </Link>
          </div>
          {activity.length === 0 ? (
            <EmptyState icon="activity" title="No activity yet" />
          ) : (
            <div className="divide-y divide-border">
              {activity.slice(0, 8).map((entry) => (
                <ActivityRow key={entry.id} entry={entry} members={members} />
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-sm">
          <h2 className="text-section-title font-medium text-ink">Items by Location</h2>
          <div className="flex flex-col gap-2">
            {locations.map((loc) => (
              <Link key={loc.id} href={`/locations/${loc.id}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-surface-muted">
                <span className="flex items-center gap-2 text-body text-ink">
                  <span aria-hidden>{loc.coverPhotoEmoji}</span>
                  {loc.name}
                </span>
                <span className="text-caption text-muted-foreground">{activeItemCountForLocation(items, loc.id)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  href,
  tone = "default",
}: {
  icon: IconName;
  label: string;
  value: number;
  href: string;
  tone?: "default" | "attention";
}) {
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-xl bg-card p-4 shadow-sm hover:shadow-lg">
      <div className={`flex size-9 items-center justify-center rounded-lg ${tone === "attention" ? "bg-danger/10 text-danger" : "bg-yellow text-white"}`}>
        <Icon name={icon} size={18} />
      </div>
      <p className="text-desktop-title font-medium text-ink">{value}</p>
      <p className="text-caption text-muted-foreground">{label}</p>
    </Link>
  );
}
