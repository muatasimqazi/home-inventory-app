"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { ScanChooserSheet } from "@/components/scan-chooser-sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { computeHouseholdSummary, contextualCaptureHref } from "@/lib/selectors";
import { INVENTORY_LINKS, FINANCE_LINKS, SHARED_LINKS } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

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
        {/* Cross-domain landing page (see src/app/(shell)/page.tsx) — its
            own top-level section, same reasoning as Settings living below
            the divider: it isn't part of either domain, it sits above both. */}
        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Overview</p>
          <nav className="flex flex-col gap-1" aria-label="Overview">
            <SidebarLink href="/" icon="home" label="Overview" pathname={pathname} exact />
          </nav>
        </div>

        <div>
          <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Home inventory</p>
          <nav className="flex flex-col gap-1" aria-label="Home inventory">
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
