"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icon";
import { ScanChooserSheet } from "@/components/scan-chooser-sheet";
import { useInventoryStore } from "@/lib/store";
import { contextualCaptureHref } from "@/lib/selectors";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { cn } from "@/lib/utils";

// Household Hub Addendum §6's originally-decided shape (Home, Search,
// [Scan FAB], More), landed on for real 2026-08-18 after a first attempt
// (the 2026-08-18 nav cutover) kept Locations as its own persistent tab to
// avoid disrupting existing muscle memory — which turned out to just be a
// different kind of confusing: Locations got one-tap access its own
// domain's other screens don't have, while Finance's equivalent (Accounts)
// sits two taps deep in More, an inconsistency raised directly and fixed
// here. Home's own dashboard already links to Locations ("Storage
// containers → View all"), and More also lists it explicitly now — so
// nothing becomes harder to reach, it just no longer gets a uniquely
// privileged slot relative to Finance.
const LEFT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/dashboard", icon: "home", label: "Home" },
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
  // iOS Safari doesn't shrink the layout viewport when the keyboard opens
  // (see the hook's own comment) — without this, e.g. focusing /search's
  // own input pushes this fixed tab bar behind the keyboard. No-op on
  // Chromium, which already handles this natively.
  const keyboardInset = useKeyboardInset();

  function renderTab(tab: (typeof LEFT_TABS)[number]) {
    const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
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
        <span className={cn("text-micro leading-none", active ? "text-ink" : "text-muted-foreground")}>{tab.label}</span>
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
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-17.5 items-center border-t border-border bg-white px-2 pb-[env(safe-area-inset-bottom)] md:hidden print:hidden"
        style={{ bottom: keyboardInset }}
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
