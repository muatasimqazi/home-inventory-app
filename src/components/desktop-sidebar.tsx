"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { computeHouseholdSummary, contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Every one of these is inventory-scoped (search/favorites/activity all
// operate on items; the desktop-only tools manage inventory specifically) —
// previously split across three separate blocks (a "primary" nav matching
// Figma's original list, an unlabeled "More" nav, and a catch-all bottom
// block that also had Settings mixed into it). Consolidated into one real
// "Home inventory" section so the sidebar reads as two domain sections
// (this + Finance) plus one standalone cross-cutting Settings link, not
// three-plus loosely-related groups. Order: Figma's original primary set
// first (Dashboard/Locations/Needs Review/Tags/Trash), then the rest.
const INVENTORY_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/search", icon: "search", label: "Search" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/activity?domain=inventory", icon: "activity", label: "Activity" },
  { href: "/desktop", icon: "activity", label: "Activity Dashboard" },
  { href: "/desktop/manage", icon: "box", label: "Manage" },
  { href: "/desktop/labels", icon: "tag", label: "Label Printing" },
  { href: "/settings/import", icon: "upload", label: "Import CSV" },
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

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Home inventory</p>
          <nav className="flex flex-col gap-1" aria-label="Home inventory">
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
            <SidebarLink href="/trash" icon="trash" label="Trash" pathname={pathname} />
            {INVENTORY_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} pathname={pathname} />
          ))}
            <Link
              href={scanHref}
              className="tap-target mt-1 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-2.5 text-caption font-medium text-white"
            >
              <Icon name="camera" size={16} />
              Scan
            </Link>
          </nav>
        </div>

        {/* Finance domain — 2026-08-18 nav cutover (Household Hub Addendum §6,
            Platform Foundation Addendum's "desktop shows every domain as a
            sidebar section, not a mobile-style switcher" recommendation).
            Self-contained, same shape as Home inventory above. */}
        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Finance</p>
          <nav className="flex flex-col gap-1" aria-label="Finance">
            <SidebarLink href="/finance/dashboard" icon="trendingUp" label="Dashboard" pathname={pathname} />
            <SidebarLink href="/finance/accounts" icon="wallet" label="Accounts" pathname={pathname} />
            <SidebarLink href="/finance/transactions" icon="receipt" label="Transactions" pathname={pathname} />
            <SidebarLink href="/finance/categories" icon="pieChart" label="Categories & Rules" pathname={pathname} />
            <SidebarLink href="/finance/recurring" icon="repeat" label="Recurring Bills" pathname={pathname} />
            <SidebarLink href="/finance/net-worth" icon="trendingUp" label="Net Worth" pathname={pathname} />
            <SidebarLink href="/activity?domain=finance" icon="activity" label="Activity" pathname={pathname} />
            <SidebarLink href="/finance/import" icon="upload" label="Import CSV" pathname={pathname} />
            <SidebarLink href="/trash?tab=finance" icon="trash" label="Trash" pathname={pathname} />
            <Link
              href="/finance/scan"
              className="tap-target mt-1 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-2.5 text-caption font-medium text-white"
            >
              <Icon name="camera" size={16} />
              Scan Receipt
            </Link>
          </nav>
        </div>
      </div>

      {/* Settings governs the household as a whole (members, billing-free
          household admin, sign-out) — cross-cutting, not owned by either
          domain, so it stands alone rather than being clustered into
          either section above (or, as it was before, into an unlabeled
          bottom block that also held inventory-only tools). */}
      <div className="border-t border-border pt-4">
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
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
