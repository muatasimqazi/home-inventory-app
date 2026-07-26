"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { useInventoryStore } from "@/lib/store";
import { computeHouseholdSummary } from "@/lib/selectors";
import { cn } from "@/lib/utils";

// Primary nav order/set matches Figma v2 Desktop Dashboard sidebar (node
// 190:19) exactly: Dashboard, Locations, Needs Review, Tags, Trash — see
// SidebarLink calls below.

// Kept reachable but not in Figma's primary list — grouped separately so the
// primary nav stays a tight match to the design.
const SECONDARY_LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/search", icon: "search", label: "Search" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/activity", icon: "activity", label: "Activity" },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const household = useInventoryStore((s) => s.household);
  const locations = useInventoryStore((s) => s.locations);
  const items = useInventoryStore((s) => s.items);
  const summary = computeHouseholdSummary(items, locations);

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-border md:bg-white md:px-4 md:py-6">
      <div className="flex items-center gap-3 px-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-yellow text-white">
          <Icon name="home" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Shohaz</p>
          <p className="truncate text-caption text-muted-foreground">{household.name}</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Primary">
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
        <SidebarLink href="/settings/trash" icon="trash" label="Trash" pathname={pathname} />
      </nav>

      <nav className="flex flex-col gap-1 border-t border-border pt-4" aria-label="More">
        {SECONDARY_LINKS.map((link) => (
          <SidebarLink key={link.href} {...link} pathname={pathname} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        <SidebarLink href="/desktop" icon="activity" label="Activity Dashboard" pathname={pathname} />
        <SidebarLink href="/desktop/manage" icon="box" label="Manage" pathname={pathname} />
        <SidebarLink href="/desktop/labels" icon="tag" label="Label Printing" pathname={pathname} />
        <SidebarLink href="/settings/import" icon="upload" label="Import CSV" pathname={pathname} />
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
        <Link
          href="/capture"
          className="tap-target mt-2 flex items-center justify-center gap-2 rounded-md bg-yellow px-4 py-3 text-body font-medium text-white"
        >
          <Icon name="camera" size={18} />
          Scan
        </Link>
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
