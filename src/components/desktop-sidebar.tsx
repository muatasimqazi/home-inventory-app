"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { ScanChooserSheet } from "@/components/scan-chooser-sheet";
import { useInventoryStore, useCurrentHousehold } from "@/lib/store";
import { computeHouseholdSummary, contextualCaptureHref } from "@/lib/selectors";
import { INVENTORY_LINKS, FINANCE_LINKS, SHARED_LINKS } from "@/lib/nav-links";
import { cn } from "@/lib/utils";

const COLLAPSED_STORAGE_KEY = "shohaz:sidebar-collapsed";

// The three INVENTORY_LINKS entries this sidebar renders out of order (see
// the "Home inventory" section below) — filtered out of the trailing flat
// map so they don't also render a second time in their array position.
const PINNED_INVENTORY_HREFS = new Set(["/containers", "/wardrobe", "/unassigned"]);

function pinnedInventoryLink(href: string) {
  const link = INVENTORY_LINKS.find((l) => l.href === href);
  if (!link) throw new Error(`pinnedInventoryLink: no INVENTORY_LINKS entry for ${href}`);
  return link;
}

export function DesktopSidebar() {
  const pathname = usePathname();
  const household = useCurrentHousehold();
  const locations = useInventoryStore((s) => s.locations);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const summary = computeHouseholdSummary(items, locations);
  const scanHref = contextualCaptureHref(pathname, containers);
  const [chooserOpen, setChooserOpen] = useState(false);
  // Defaults to expanded on both server and first client render (no
  // access to localStorage during SSR/initial hydration — reading it
  // synchronously here would mismatch and trip a hydration warning), then
  // reconciled from the persisted preference right after mount. Returning
  // users with a collapsed sidebar see one initial frame expanded before
  // this runs, same tradeoff every localStorage-backed UI preference in a
  // server-rendered app makes.
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // Deferred a tick (react-hooks/set-state-in-effect) — same pattern as
    // every other "reconcile from an external source on mount" effect in
    // this app (e.g. finance/recurring/detected/page.tsx's load()): the
    // read-and-possibly-setCollapsed shouldn't run synchronously inside
    // the effect body itself, only as a reaction once it's scheduled.
    queueMicrotask(() => {
      const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "true");
    });
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(next));
      } catch {
        // Private-browsing/storage-disabled contexts can throw on write —
        // the toggle still works for this session, it just won't persist.
      }
      return next;
    });
  }

  return (
    <aside
      className={cn(
        "hidden md:flex md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-border md:bg-card md:py-6 md:transition-[width] md:duration-200 print:hidden",
        collapsed ? "md:w-16 md:px-2" : "md:w-64 md:px-4"
      )}
    >
      <div className={cn("flex items-center gap-3", collapsed ? "flex-col px-0" : "px-2")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={36} height={36} className="size-9 shrink-0 rounded-[10px]" />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink">Schuaz</p>
            <p className="truncate text-caption text-muted-foreground">{household.name}</p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="tap-target flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-surface-muted hover:text-ink"
        >
          <Icon name={collapsed ? "panelLeftOpen" : "panelLeftClose"} size={18} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto">
        {/* Cross-domain landing page (see src/app/(shell)/page.tsx) — its
            own top-level section, same reasoning as Settings living below
            the divider: it isn't part of either domain, it sits above both. */}
        <div>
          {!collapsed && <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Overview</p>}
          <nav className="flex flex-col gap-1" aria-label="Overview">
            <SidebarLink href="/dashboard" icon="home" label="Overview" pathname={pathname} exact collapsed={collapsed} />
            {/* Notes (0050_notes.sql) — a small always-on utility, not an
                opt-in vertical like Inventory/Finance below, so it isn't
                gated behind a household.xEnabled flag and sits up here
                next to Overview instead of getting its own section. */}
            <SidebarLink href="/notes" icon="notebook" label="Notes" pathname={pathname} collapsed={collapsed} />
            {/* Household Tasks (0051_household_tasks.sql) — same always-on,
                ungated placement as Notes right above. */}
            <SidebarLink href="/tasks" icon="tasks" label="Tasks" pathname={pathname} collapsed={collapsed} />
          </nav>
        </div>

        {/* Household-setup's domain choice (0033_household_domains.sql) —
            a household that opted out of a domain gets no sidebar section
            for it at all, not just a hidden-but-reachable one. */}
        {household.inventoryEnabled && (
          <div>
            {!collapsed && <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Home inventory</p>}
            <nav className="flex flex-col gap-1" aria-label="Home inventory">
              <SidebarLink href="/locations" icon="box" label="Locations" pathname={pathname} collapsed={collapsed} />
              {/* Containers/Wardrobe pulled out of the flat INVENTORY_LINKS
                  map below and rendered here instead — right under
                  Locations reads as the natural drill-down (Location ->
                  Container), same physical-browse axis Locations itself
                  is on. Still defined once in nav-links.ts (spread from
                  there, not re-typed) so href/icon/label can't drift; only
                  the *position* is special-cased, same as this section's
                  pre-existing Needs Review/Tags carve-out below. */}
              <SidebarLink {...pinnedInventoryLink("/containers")} pathname={pathname} collapsed={collapsed} />
              <SidebarLink {...pinnedInventoryLink("/wardrobe")} pathname={pathname} collapsed={collapsed} />
              <Link
                href="/review"
                title={collapsed ? "Needs Review" : undefined}
                className={cn(
                  "relative flex items-center gap-3 rounded-lg py-2 text-body",
                  collapsed ? "justify-center px-0" : "px-3",
                  pathname.startsWith("/review") ? "bg-surface-muted text-ink" : "text-ink hover:bg-surface-muted"
                )}
              >
                <Icon name="needsReview" size={18} />
                {collapsed ? (
                  <ReviewBadge count={summary.needsReviewCount} className="absolute right-1 top-1 h-3.5 min-w-3.5 px-0.5" />
                ) : (
                  <>
                    <span className="flex-1">Needs Review</span>
                    <ReviewBadge count={summary.needsReviewCount} />
                  </>
                )}
              </Link>
              {/* Unassigned right after Needs Review — both are "this
                  needs your attention" queues, not browsing surfaces. */}
              <SidebarLink {...pinnedInventoryLink("/unassigned")} pathname={pathname} collapsed={collapsed} />
              <SidebarLink href="/tags" icon="tag" label="Tags" pathname={pathname} collapsed={collapsed} />
              {INVENTORY_LINKS.filter((link) => !PINNED_INVENTORY_HREFS.has(link.href)).map((link) => (
                <SidebarLink key={link.href} {...link} pathname={pathname} collapsed={collapsed} />
              ))}
            </nav>
          </div>
        )}

        {/* Finance domain — 2026-08-18 nav cutover (Household Hub Addendum §6,
            Platform Foundation Addendum's "desktop shows every domain as a
            sidebar section, not a mobile-style switcher" recommendation). */}
        {household.financeEnabled && (
          <div>
            {!collapsed && <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Finance</p>}
            <nav className="flex flex-col gap-1" aria-label="Finance">
              {FINANCE_LINKS.map((link) => (
                <SidebarLink key={link.href} {...link} pathname={pathname} collapsed={collapsed} />
              ))}
            </nav>
          </div>
        )}

        {/* Shared across both domains — one Scan trigger (opens the same
            item-vs-receipt chooser the mobile FAB uses, replacing two
            separate "Scan"/"Scan Receipt" buttons) plus the already-merged
            Activity/Trash/Import CSV pages. */}
        <div>
          {!collapsed && <p className="px-3 pb-1 text-micro font-semibold tracking-wide text-muted-foreground uppercase">Shared</p>}
          <nav className="flex flex-col gap-1" aria-label="Shared">
            {SHARED_LINKS.map((link) => (
              <SidebarLink key={link.href} {...link} pathname={pathname} collapsed={collapsed} />
            ))}
            <button
              type="button"
              onClick={() => setChooserOpen(true)}
              title={collapsed ? "Scan" : undefined}
              className={cn(
                "tap-target mt-1 flex items-center justify-center gap-2 rounded-md bg-yellow text-caption font-medium text-white",
                collapsed ? "size-8 self-center px-0 py-0" : "px-4 py-2.5"
              )}
            >
              <Icon name="camera" size={16} />
              {!collapsed && "Scan"}
            </button>
          </nav>
        </div>
      </div>

      {/* Settings governs the household as a whole (members, household
          admin, sign-out) — cross-cutting, but distinct in kind from the
          Shared section above (a settings surface, not a shared action/
          view), so it keeps its own standalone slot below a divider. */}
      <div className="border-t border-border pt-4">
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} collapsed={collapsed} />
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
  collapsed,
}: {
  href: string;
  icon: IconName;
  label: string;
  pathname: string;
  exact?: boolean;
  collapsed?: boolean;
}) {
  const active = exact ? pathname === href : pathname.startsWith(href);
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "flex items-center gap-3 rounded-lg py-2 text-body",
        collapsed ? "justify-center px-0" : "px-3",
        active ? "bg-surface-muted text-ink" : "text-ink hover:bg-surface-muted"
      )}
    >
      <Icon name={icon} size={18} />
      {!collapsed && label}
    </Link>
  );
}
