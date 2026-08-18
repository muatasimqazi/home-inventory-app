"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { computeHouseholdSummary, contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Primary nav order/set matches Figma v2 Desktop Dashboard sidebar (node
// 190:19) exactly: Dashboard, Locations, Needs Review, Tags, Trash — see
// SidebarLink calls below.

// Kept reachable but not in Figma's primary list — grouped separately so the
// primary nav stays a tight match to the design.
const SECONDARY_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/search", icon: "search", label: "Search" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/activity", icon: "activity", label: "Activity" },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const household = useCurrentHousehold();
  const locations = useInventoryStore((s) => s.locations);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const summary = computeHouseholdSummary(items, locations);
  const scanHref = contextualCaptureHref(pathname, containers);

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-border md:bg-white md:px-4 md:py-6">
      <div className="flex items-center gap-3 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[10px]" />
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Shohaz</p>
          <p className="truncate text-caption text-muted-foreground">{household.name}</p>
        </div>
      </div>

      <p className="px-3 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Home inventory</p>
      <nav className="-mt-3 flex flex-col gap-1" aria-label="Home inventory">
        <SidebarLink href="/" icon="home" label="Dashboard" pathname={pathname} exact />
        <SidebarLink href="/locations" icon="box" label="Locations" pathname={pathname} />
        <Link
          href="/review"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
            pathname.startsWith("/review") ? "bg-surface-muted text-ink" : "text-ink hover:bg-surface-muted"
          )}
        >
          <Icon name="needsReview" size={18} />
          <span className="flex-1">Needs Review</span>
          <ReviewBadge count={summary.needsReviewCount} />
        </Link>
        <SidebarLink href="/tags" icon="tag" label="Tags" pathname={pathname} />
        <SidebarLink href="/settings/trash" icon="trash" label="Trash" pathname={pathname} />
      </nav>

      {/* Finance domain — 2026-08-18 nav cutover (Household Hub Addendum §6,
          Platform Foundation Addendum's "desktop shows every domain as a
          sidebar section, not a mobile-style switcher" recommendation).
          Additive only: nothing above this changes for existing users. */}
      <p className="-mb-3 px-3 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Finance</p>
      <nav className="flex flex-col gap-1" aria-label="Finance">
        <SidebarLink href="/finance/dashboard" icon="trendingUp" label="Dashboard" pathname={pathname} />
        <SidebarLink href="/finance/accounts" icon="wallet" label="Accounts" pathname={pathname} />
        <SidebarLink href="/finance/transactions" icon="receipt" label="Transactions" pathname={pathname} />
        <SidebarLink href="/finance/categories" icon="pieChart" label="Categories & Rules" pathname={pathname} />
        <SidebarLink href="/finance/recurring" icon="repeat" label="Recurring Bills" pathname={pathname} />
        <SidebarLink href="/finance/net-worth" icon="trendingUp" label="Net Worth" pathname={pathname} />
        <SidebarLink href="/finance/activity" icon="activity" label="Activity" pathname={pathname} />
        <SidebarLink href="/finance/trash" icon="trash" label="Trash" pathname={pathname} />
        <Link
          href="/finance/scan"
          className="tap-target mt-1 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-2.5 text-caption font-medium text-white"
        >
          <Icon name="camera" size={16} />
          Scan Receipt
        </Link>
      </nav>

      <nav className="flex flex-col gap-1 border-t border-border pt-4" aria-label="More">
        {SECONDARY_LINKS.map((link) => (
          <SidebarLink key={link.href} {...link} pathname={pathname} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        <SidebarLink href="/desktop" icon="activity" label="Activity Dashboard" pathname={pathname} />
        <SidebarLink href="/desktop/manage" icon="box" label="Manage" pathname={pathname} />
        <SidebarLink href="/desktop/labels" icon="tag" label="Label Printing" pathname={pathname} />
        <SidebarLink href="/settings/import" icon="upload" label="Import CSV" pathname={pathname} />
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
        <Link
          href={scanHref}
          className="tap-target mt-2 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-3 text-body font-medium text-white"
        >
          <Icon name="camera" size={18} />
          Scan
        </Link>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  pathname,
  exact,
}: {
  href: string;
  icon: IconName;
  label: string;
  pathname: string;
  exact?: boolean;
}) {
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
        active ? "bg-surface-muted text-ink" : "text-ink hover:bg-surface-muted"
      )}
    >
      <Icon name={icon} size={18} />
      {label}
    </Link>
  );
}
