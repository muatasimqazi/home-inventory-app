"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { ScanChooserSheet } from "@/components/scan-chooser-sheet";
import { useInventoryStore } from "@/lib/store";
import { contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Reversed back to a persistent Locations tab (2026-08-21) after the
// 2026-08-18 cutover below demoted it to More — reported directly against
// the real app: a home-inventory app burying "browse what I own" two taps
// deep is a real regression, not a nitpick, even though it reintroduces
// the exact asymmetry the 2026-08-18 change was fixing (Finance's
// equivalent, Accounts, still sits in More). That trade-off is deliberate
// this time, not an oversight: Locations/inventory is this app's primary,
// first-run domain (the name, the onboarding, the marketing copy are all
// inventory-first); Finance is real but secondary. Consistency between the
// two domains' nav treatment isn't worth the cost of making the core loop
// harder to reach. Kept in both places rather than removed from More —
// More's own list still makes sense as "everything in this domain,"
// Locations included, same as Favorites/Home Map/Manage sitting alongside
// their own hub pages elsewhere.
//
// Original 2026-08-18 reasoning, still true for *why the symmetric version
// existed* even though it's no longer the answer: a first attempt at this
// cutover kept Locations as its own persistent tab specifically to avoid
// disrupting existing muscle memory — which turned out to be a different
// kind of confusing, since Locations got one-tap access its own domain's
// other screens (Favorites, Home Map, Manage) don't have, while Finance's
// equivalent (Accounts) sat two taps deep in More. Home's own dashboard
// still also links to Locations ("Storage containers → View all").
const LEFT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/locations", icon: "box", label: "Locations" },
  { href: "/search", icon: "search", label: "Search" },
];

// More and Settings were one combined page/tab until 2026-08-18, doubling
// as a domain switcher (Locations/Finance cards) *and* the real household
// Settings content underneath — Settings had no visible tab of its own.
// Split into two genuine tabs: More stays the domain switcher (/more),
// Settings gets its own slot back (/settings), restoring a symmetric
// 2-left/2-right layout around the Scan FAB.
const RIGHT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/settings", icon: "settings", label: "Settings" },
  { href: "/more", icon: "grid", label: "More" },
];

export function BottomNav() {
  const pathname = usePathname();
  const containers = useInventoryStore((s) => s.containers);
  const scanHref = contextualCaptureHref(pathname, containers);
  const [chooserOpen, setChooserOpen] = useState(false);

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
    <>
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
        //
        // Left/right groups are each their own flex-1 justify-around
        // region (rather than every tab + the FAB sharing one flat
        // justify-around row, the pre-2026-08-18 approach) specifically so
        // the FAB stays visually centered even with an unequal tab count
        // on each side (2 left, 1 right) — a flat row would put it at the
        // 3rd-of-4 position, off-center.
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-17.5 items-center border-t border-border bg-white px-2 pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <div className="flex flex-1 items-center justify-around">{LEFT_TABS.map(renderTab)}</div>

        <button
          type="button"
          onClick={() => setChooserOpen(true)}
          aria-label="Scan"
          className="tap-target -mt-8 flex size-16 shrink-0 items-center justify-center rounded-full bg-yellow text-white shadow-lg"
        >
          <Icon name="camera" size={24} />
        </button>

        <div className="flex flex-1 items-center justify-around">{RIGHT_TABS.map(renderTab)}</div>
      </nav>

      <ScanChooserSheet open={chooserOpen} onOpenChange={setChooserOpen} itemScanHref={scanHref} />
    </>
  );
}
