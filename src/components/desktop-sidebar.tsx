"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { ScanChooserSheet } from "@/components/scan-chooser-sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { computeHouseholdSummary, contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Genuinely inventory-only — nothing here is shared with Finance.
const INVENTORY_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/search", icon: "search", label: "Search" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/desktop", icon: "activity", label: "Activity Dashboard" },
  { href: "/desktop/manage", icon: "box", label: "Manage" },
  { href: "/desktop/labels", icon: "tag", label: "Label Printing" },
];

// Genuinely Finance-only.
const FINANCE_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/finance/dashboard", icon: "trendingUp", label: "Dashboard" },
  { href: "/finance/accounts", icon: "wallet", label: "Accounts" },
  { href: "/finance/transactions", icon: "receipt", label: "Transactions" },
  { href: "/finance/categories", icon: "pieChart", label: "Categories & Rules" },
  { href: "/finance/recurring", icon: "repeat", label: "Recurring Bills" },
  { href: "/finance/net-worth", icon: "trendingUp", label: "Net Worth" },
];

// Activity/Trash/Import CSV were each already merged into one shared page
// (docs note: Trash keeps two tabbed panels, Activity a real combined
// feed) — but the sidebar was still listing all three *twice*, once
// inside each domain section, just pointed at the same shared route with
// a different query param. That's not two features, it's one feature
// with a duplicated nav entry, which is exactly the kind of "shared item
// living in both domains" the Trash/Activity/Import consolidation was
// supposed to fix — the page merge didn't fully land until the nav
// stopped re-duplicating it too. Pulled out into their own neutral
// section, same reasoning that already moved Settings out on its own.
const SHARED_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/activity", icon: "activity", label: "Activity" },
  { href: "/trash", icon: "trash", label: "Trash" },
  { href: "/import", icon: "upload", label: "Import CSV" },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const household = useCurrentHousehold();
  const locations = useInventoryStore((s) => s.locations);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const summary = computeHouseholdSummary(items, locations);
  const scanHref = contextualCaptureHref(pathname, containers);
  const [chooserOpen, setChooserOpen] = useState(false);

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
            {INVENTORY_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} pathname={pathname} />
            ))}
          </nav>
        </div>

        {/* Finance domain — 2026-08-18 nav cutover (Household Hub Addendum §6,
            Platform Foundation Addendum's "desktop shows every domain as a
            sidebar section, not a mobile-style switcher" recommendation). */}
        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Finance</p>
          <nav className="flex flex-col gap-1" aria-label="Finance">
            {FINANCE_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} pathname={pathname} />
            ))}
          </nav>
        </div>

        {/* Shared across both domains — one Scan trigger (opens the same
            item-vs-receipt chooser the mobile FAB uses, replacing two
            separate "Scan"/"Scan Receipt" buttons) plus the already-merged
            Activity/Trash/Import CSV pages. */}
        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Shared</p>
          <nav className="flex flex-col gap-1" aria-label="Shared">
            {SHARED_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} pathname={pathname} />
            ))}
            <button
              type="button"
              onClick={() => setChooserOpen(true)}
              className="tap-target mt-1 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-2.5 text-caption font-medium text-white"
            >
              <Icon name="camera" size={16} />
              Scan
            </button>
          </nav>
        </div>
      </div>

      {/* Settings governs the household as a whole (members, household
          admin, sign-out) — cross-cutting, but distinct in kind from the
          Shared section above (a settings surface, not a shared action/
          view), so it keeps its own standalone slot below a divider. */}
      <div className="border-t border-border pt-4">
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
      </div>

      <ScanChooserSheet open={chooserOpen} onOpenChange={setChooserOpen} itemScanHref={scanHref} />
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
