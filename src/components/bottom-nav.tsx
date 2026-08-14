"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { contextualCaptureHref } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Tab set and order match Figma v2 Dashboard (node 198:76) exactly: Home,
// Search, [Scan FAB], Locations, Settings — no Favorites tab here.
const LEFT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "home", label: "Home" },
  { href: "/search", icon: "search", label: "Search" },
];

const RIGHT_TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/locations", icon: "box", label: "Locations" },
  { href: "/settings", icon: "settings", label: "Settings" },
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
      // bottom-4 was a flat 16px from the true screen edge — fine in a
      // normal Safari tab (Safari reserves the home-indicator strip itself,
      // outside the page), but installed to the home screen the page draws
      // full-bleed under it (viewport-fit=cover, see layout.tsx), so the
      // pill sat right against the home indicator. Additive rather than
      // max(): env() is 0 on anything without a home indicator, so this is
      // still exactly 16px there — unchanged from before.
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex h-17.5 items-center justify-around rounded-3xl border border-border bg-white px-2 shadow-sm md:hidden"
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
