"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
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
      className="fixed inset-x-4 bottom-4 z-40 flex h-17.5 items-center justify-around rounded-3xl border border-border bg-white px-2 shadow-sm md:hidden"
    >
      {LEFT_TABS.map(renderTab)}

      <Link
        href="/capture"
        aria-label="Scan item"
        className="tap-target -mt-8 flex size-16 shrink-0 items-center justify-center rounded-full bg-yellow text-white shadow-lg"
      >
        <Icon name="camera" size={24} />
      </Link>

      {RIGHT_TABS.map(renderTab)}
    </nav>
  );
}
