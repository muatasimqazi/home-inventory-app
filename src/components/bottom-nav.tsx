"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Tab set matches Figma v2 Dashboard (node 198:76): Home, Search,
// [Scan FAB], Locations. The 4th tab was "Settings" until the 2026-08-18
// Finance nav cutover (Household Hub Addendum §6) — relabeled "More" so
// Finance has a one-tap-away home in the global nav, without inventing a
// second hub page: /settings already serves as "everything else" (household,
// members, tags, activity, trash, sign out), so this is the same screen
// with a Finance entry card added at its top, not a new route. Locations
// deliberately stays a persistent top-level tab rather than moving under
// "More" too, unlike the Household Hub Addendum's literal 4-tab mock
// (Home/Search/FAB/More only) — existing users' one-tap access to their
// most-used inventory screen shouldn't regress as the cost of adding
// Finance; a fuller Home/nav redesign (cross-domain attention cards, an
// Inventory-internal sub-nav to match Finance's own) stays a deliberately
// deferred, separate, larger effort, not bundled into this cutover.
const LEFT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/search", icon: "search", label: "Search" },
];

const RIGHT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/locations", icon: "box", label: "Locations" },
  { href: "/settings", icon: "grid", label: "More" },
];

export function BottomNav() {
  const pathname = usePathname();
  const containers = useInventoryStore((s) => s.containers);
  const scanHref = contextualCaptureHref(pathname, containers);

  function renderTab(tab: (typeof LEFT_TABS)[number]) {
    const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
    return (
      <Link
        key={tab.href}
        href={tab.href}
        className="tap-target flex flex-col items-center justify-center gap-1.5 rounded-2xl px-3 py-1.5"
        aria-current={active ? "page" : undefined}
      >
        <span className={cn("flex size-5.5 items-center justify-center", active ? "text-ink" : "text-muted-foreground")}>
          <Icon name={tab.icon} size={22} />
        </span>
        <span className={cn("text-[11px] leading-none", active ? "text-ink" : "text-muted-foreground")}>{tab.label}</span>
        <span className={cn("size-1.25 rounded-full", active ? "bg-yellow" : "bg-transparent")} aria-hidden />
      </Link>
    );
  }

  return (
    <nav
      aria-label="Primary"
      // Was a floating rounded pill inset from every edge (Figma v2's
      // literal spec) — reads as a card sitting *on* the page rather than
      // the OS's own chrome, which is what actually made it feel
      // un-app-like once the page was full-bleed in standalone mode.
      // Docked to a real native iOS tab bar instead: full-width, flush to
      // the bottom edge, square corners, a top hairline instead of a
      // shadow. min-h (not h) + padding-bottom keeps the icon row itself
      // at its original full height and just appends a same-color strip
      // below for the safe area, rather than the safe area eating into
      // the tap targets — that's also why the inset moved from the
      // outer edge (bottom-*) to inner padding here.
      className="fixed inset-x-0 bottom-0 z-40 flex min-h-17.5 items-center justify-around border-t border-border bg-white px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {LEFT_TABS.map(renderTab)}

      <Link
        href={scanHref}
        aria-label="Scan item"
        className="tap-target -mt-8 flex size-16 shrink-0 items-center justify-center rounded-full bg-yellow text-white shadow-lg"
      >
        <Icon name="camera" size={24} />
      </Link>

      {RIGHT_TABS.map(renderTab)}
    </nav>
  );
}
