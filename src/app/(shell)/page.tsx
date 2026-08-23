"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SearchBar } from "@/components/search-bar";
import { ContainerCarousel } from "@/components/container-carousel";
import { CreateChooserSheet } from "@/components/create-chooser-sheet";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { PhotoThumb } from "@/components/photo-thumb";
import { Badge } from "@/components/ui/badge";
import { ReviewBadge } from "@/components/review-badge";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import {
  accountTypeIcon,
  activeContainers,
  activeLocations,
  breadcrumbLabel,
  buildBreadcrumb,
  cashFlowForMonth,
  computeHouseholdSummary,
  containerStatusFlags,
  daysUntil,
  genericPhotoItemCount,
  groupAccountsByType,
  looseItemCount,
  netWorth,
  recentTransactions,
  unreadActivityCount,
  upcomingRecurringBills,
} from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ONBOARDING_THRESHOLD = 5;
const BILLS_DUE_SOON_DAYS = 7;
// Same "at a glance, not the whole list" cap every other Overview preview
// (e.g. recentContainers below) already applies — nothing currently
// deletes a tag (getOrCreateTag only adds), so an unbounded list here
// would only grow and eventually push the rest of the page below the
// fold. "View all" (next to the heading) is the actual full list.
const TAGS_PREVIEW_LIMIT = 8;

/**
 * The former Home page was an inventory-only dashboard living at "/" —
 * fine while Shohaz had one domain, but a household-hub home needs to
 * represent every domain, not lead with one. This is that: a cross-domain
 * Overview (Household Hub Addendum §6's "what needs attention" view) with
 * a stat row pulling one headline number from each domain, a Home
 * Inventory section (the old Home page's content, now scoped under its
 * own heading), and a Finance section alongside it. Desktop sidebar gained
 * a matching standalone "Overview" nav entry above the per-domain
 * sections; mobile's bottom-nav "Home" tab still points here unchanged.
 */
export default function OverviewPage() {
  const router = useRouter();
  const household = useCurrentHousehold();
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = activeLocations(useInventoryStore((s) => s.locations));
  const activity = useInventoryStore((s) => s.activity);
  const members = useInventoryStore((s) => s.members);
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const tags = useInventoryStore((s) => s.tags);
  const currentUserId = useInventoryStore((s) => s.currentUserId);

  const [view, setView] = useState<"mine" | "household">("mine");
  const [createChooserOpen, setCreateChooserOpen] = useState(false);

  const activeItems = items.filter((it) => it.status === "active");
  const activeContainerList = activeContainers(containers);
  const recentContainers = [...activeContainerList].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 4);
  const summary = computeHouseholdSummary(items, locations);
  const loose = looseItemCount(items);
  const genericPhotos = genericPhotoItemCount(items);
  const latestActivity = activity[0];
  const actor = latestActivity ? members.find((m) => m.userId === latestActivity.actorUserId) : null;
  const me = members.find((m) => m.userId === currentUserId);
  const unreadCount = unreadActivityCount(activity, currentUserId, me?.lastActivityViewedAt ?? null);
  const sortedTags = [...tags].sort((a, b) => a.name.localeCompare(b.name));

  // Same My Dashboard/Household split as the Finance Dashboard itself
  // (Personal Finance Addendum, "Privacy model") — Household never
  // aggregates a private balance into a household total, even here.
  // Inventory has no per-record privacy model, so the toggle only
  // affects the Finance numbers below.
  const scopedAccounts = view === "household" ? accounts.filter((a) => a.ownerUserId === null) : accounts;
  const scopedTransactions =
    view === "household" ? transactions.filter((t) => scopedAccounts.some((a) => a.id === t.accountId)) : transactions;
  const scopedBills = view === "household" ? recurringBills.filter((b) => b.ownerUserId === null) : recurringBills;

  const worth = netWorth(scopedAccounts);
  const thisMonth = cashFlowForMonth(scopedTransactions, new Date());
  const accountGroups = groupAccountsByType(scopedAccounts);
  const recentTxns = recentTransactions(scopedTransactions, 4);
  const upcomingBills = upcomingRecurringBills(scopedBills, 3);
  const billsDueSoonCount = upcomingRecurringBills(scopedBills).filter((b) => daysUntil(b.nextDueDate) <= BILLS_DUE_SOON_DAYS).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Overview</p>
          <h1 className="mt-0.5 text-screen-title font-semibold text-ink">{household.name}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCreateChooserOpen(true)}
            aria-label="Add"
            className="tap-target flex size-11 items-center justify-center rounded-md bg-yellow text-white shadow-lg"
          >
            <Icon name="plus" size={20} />
          </button>
          <Link href="/activity" aria-label="Activity" className="tap-target relative flex size-11 items-center justify-center rounded-md border border-border bg-white">
            <Icon name="bell" size={20} className="text-ink" />
            <ReviewBadge count={unreadCount} className="absolute -right-1 -top-1 bg-danger" />
          </Link>
        </div>
      </div>

      <SearchBar value="" onChange={() => {}} onFocus={() => router.push("/search")} className="md:hidden" />

      <div className="flex gap-0.5 rounded-lg bg-surface-muted p-0.75 md:w-80">
        <button
          type="button"
          onClick={() => setView("mine")}
          className={cn(
            "flex-1 rounded-md py-2 text-caption font-semibold transition-colors",
            view === "mine" ? "bg-white text-yellow shadow-sm" : "text-muted-foreground"
          )}
        >
          My Dashboard
        </button>
        <button
          type="button"
          onClick={() => setView("household")}
          className={cn(
            "flex-1 rounded-md py-2 text-caption font-semibold transition-colors",
            view === "household" ? "bg-white text-yellow shadow-sm" : "text-muted-foreground"
          )}
        >
          Household
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Inventory</p>
          <p className="mt-1 text-item-title font-semibold text-ink">
            {summary.totalActiveItems} item{summary.totalActiveItems === 1 ? "" : "s"}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">
            {activeContainerList.length} container{activeContainerList.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Net Worth</p>
          <p className="mt-1 text-item-title font-semibold text-ink">{formatCurrency(worth)}</p>
          <p className="mt-0.5 text-caption text-muted-foreground">Trend needs a few weeks</p>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Cash Flow · This Month</p>
          <div className="mt-1.5 flex items-center gap-4">
            <div>
              <p className="text-caption text-muted-foreground">Income</p>
              <p className="text-body font-semibold text-badge-green-text">{formatCurrency(thisMonth.income, { showPositiveSign: true })}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Spend</p>
              <p className="text-body font-semibold text-money-negative-text">{formatCurrency(-thisMonth.spend)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Needs Attention</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <ActionChip label="Review" count={summary.needsReviewCount} tone="purple" href="/review" />
            <ActionChip label="Photos" count={genericPhotos} tone="green" />
            <ActionChip label="Bills" count={billsDueSoonCount} tone="orange" href="/finance/recurring" />
          </div>
        </div>
      </div>

      <section aria-label="Home Inventory" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="domain-section-title text-ink">Home Inventory</h2>
          <Link href="/desktop" className="text-caption font-semibold text-ink">
            Open full dashboard
          </Link>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-micro font-semibold uppercase tracking-wide text-muted-foreground">Next up</p>
              <p className="mt-1 text-item-title font-semibold text-ink">Action queue</p>
              <p className="mt-1 text-caption text-muted-foreground">Quick checks that keep the inventory accurate.</p>
            </div>
            <Link
              href="/review"
              className="tap-target flex h-11 shrink-0 items-center justify-center rounded-md bg-yellow px-5 text-caption font-semibold text-white"
            >
              Open
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionChip label="Review" count={summary.needsReviewCount} tone="purple" />
            <ActionChip label="Photos" count={genericPhotos} tone="green" />
            <ActionChip label="Loose" count={loose} tone="orange" href="/unassigned" />
          </div>
        </div>

        {locations.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-item-title font-semibold text-ink">Storage locations</h3>
              <Link href="/locations" className="text-caption font-semibold text-ink">
                View all
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {locations.map((loc) => {
                const count = summary.itemCountByLocation[loc.id] ?? 0;
                return (
                  <Link
                    key={loc.id}
                    href={`/locations/${loc.id}`}
                    className="tap-target flex items-center gap-2.5 rounded-2xl border border-border bg-white p-3 shadow-sm"
                  >
                    <PhotoThumb
                      emoji={loc.coverPhotoEmoji ?? "📍"}
                      coverPhotoPath={loc.coverPhotoPath}
                      className="size-9 shrink-0 rounded-sm"
                      emojiClassName="text-base"
                    />
                    <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">{loc.name}</span>
                    {count > 0 && (
                      <span className="shrink-0 rounded-full bg-badge-green-bg px-2 py-0.5 text-micro font-semibold text-badge-green-text">
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-item-title font-semibold text-ink">Storage containers</h3>
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
            <ContainerCarousel
              entries={recentContainers.map((container) => {
                const flags = containerStatusFlags(items, containers, container.id);
                const itemCount = items.filter((it) => it.status === "active" && it.containerId === container.id).length;
                const status = flags.needsReview
                  ? { label: "Review", dotClassName: "bg-badge-purple-text" }
                  : flags.genericPhoto
                    ? { label: "Photo", dotClassName: "bg-yellow" }
                    : null;
                return {
                  container,
                  itemCount,
                  breadcrumbLabel: breadcrumbLabel(buildBreadcrumb(container.locationId, container.parentContainerId ?? null, locations, containers)),
                  status,
                };
              })}
            />
          )}
        </div>

        {sortedTags.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-item-title font-semibold text-ink">Tags</h3>
              <Link href="/tags" className="text-caption font-semibold text-ink">
                View all
              </Link>
            </div>
            <div className="flex flex-wrap gap-2">
              {sortedTags.slice(0, TAGS_PREVIEW_LIMIT).map((tag) => (
                <Link
                  key={tag.id}
                  href={`/tags/${tag.id}`}
                  className="tap-target flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1.5 text-caption font-medium text-ink"
                >
                  <Icon name="tag" size={14} className="text-yellow" />
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {activeItems.length >= ONBOARDING_THRESHOLD && latestActivity ? (
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
      </section>

      <section aria-label="Finance" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="domain-section-title text-ink">Finance</h2>
          <Link href="/finance/dashboard" className="text-caption font-semibold text-ink">
            Open full dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-item-title font-semibold text-ink">Accounts</h3>
              <Link href="/finance/accounts" className="text-caption font-medium text-yellow-text">
                View all
              </Link>
            </div>
            {accountGroups.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">
                No accounts yet — add one from Finance.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {accountGroups
                  .flatMap((g) => g.accounts)
                  .slice(0, 3)
                  .map((a) => (
                    <Link key={a.id} href={`/finance/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3">
                      <IconChip icon={accountTypeIcon(a.type)} tone="muted" size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-body font-medium text-ink">{a.name}</p>
                          {a.ownerUserId !== null && <Badge className="bg-badge-purple-bg text-badge-purple-text">Personal</Badge>}
                        </div>
                        <p className="truncate text-caption text-muted-foreground">
                          {a.institutionName}
                          {a.cardLastFour ? ` · ...${a.cardLastFour}` : ""}
                        </p>
                      </div>
                      <span className={cn("shrink-0 text-body font-semibold", a.currentBalance < 0 ? "text-money-negative-text" : "text-ink")}>
                        {formatCurrency(a.currentBalance)}
                      </span>
                    </Link>
                  ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-item-title font-semibold text-ink">Upcoming bills</h3>
              <Link href="/finance/recurring" className="text-caption font-medium text-yellow-text">
                View all
              </Link>
            </div>
            {upcomingBills.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">Nothing due soon.</p>
            ) : (
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {upcomingBills.map((b) => (
                  <Link key={b.id} href={`/finance/recurring?billId=${b.id}`} className="flex items-center gap-3 px-4 py-3">
                    <IconChip icon="repeat" tone="muted" size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{b.name}</p>
                      <p className="truncate text-caption text-muted-foreground">Due {formatShortDate(b.nextDueDate)}</p>
                    </div>
                    <span className="shrink-0 text-body font-semibold text-ink">{formatCurrency(b.expectedAmount)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-item-title font-semibold text-ink">Recent transactions</h3>
            <Link href="/finance/transactions" className="text-caption font-medium text-yellow-text">
              View all
            </Link>
          </div>
          {recentTxns.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">No transactions yet.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
              {recentTxns.map((t) => (
                <Link key={t.id} href={`/finance/transactions?transactionId=${t.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                    <p className="truncate text-caption text-muted-foreground">{formatShortDate(t.occurredAt)}</p>
                  </div>
                  <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                    {formatCurrency(t.amount, { showPositiveSign: true })}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <CreateChooserSheet open={createChooserOpen} onOpenChange={setCreateChooserOpen} />
    </div>
  );
}

const CHIP_TONES = {
  purple: "bg-badge-purple-bg text-badge-purple-text",
  green: "bg-badge-green-bg text-badge-green-text",
  orange: "bg-badge-orange-bg text-badge-orange-text",
} as const;

function ActionChip({ label, count, tone, href }: { label: string; count: number; tone: keyof typeof CHIP_TONES; href?: string }) {
  const className = `flex items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-semibold ${CHIP_TONES[tone]}`;
  const content = (
    <>
      {label}
      <span>{count}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}
