"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

const TABS: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "home", label: "Dashboard" },
  { href: "/locations", icon: "box", label: "Locations" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/settings", icon: "settings", label: "Settings" },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-4 bottom-4 z-40 flex h-[74px] items-center justify-around rounded-3xl bg-ink px-2 shadow-lg md:hidden"
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="tap-target flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-1.5"
            aria-current={active ? "page" : undefined}
          >
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-full transition-colors",
                active ? "bg-yellow text-ink" : "text-white"
              )}
            >
              <Icon name={tab.icon} size={20} />
            </span>
            <span className={cn("text-[11px] leading-none", active ? "text-yellow" : "text-border")}>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
