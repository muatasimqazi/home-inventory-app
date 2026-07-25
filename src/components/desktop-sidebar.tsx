"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/icon";
import { ReviewBadge } from "@/components/review-badge";
import { useInventoryStore } from "@/lib/store";
import { computeHouseholdSummary } from "@/lib/selectors";
import { cn } from "@/lib/utils";

const LINKS: { href: string; icon: IconName; label: string }[] = [
  { href: "/", icon: "home", label: "Dashboard" },
  { href: "/search", icon: "search", label: "Search" },
  { href: "/locations", icon: "box", label: "Locations" },
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/activity", icon: "activity", label: "Activity" },
  { href: "/tags", icon: "tag", label: "Tags" },
];

export function DesktopSidebar() {
  const pathname = usePathname();
  const household = useInventoryStore((s) => s.household);
  const locations = useInventoryStore((s) => s.locations);
  const items = useInventoryStore((s) => s.items);
  const summary = computeHouseholdSummary(items, locations);

  return (
    <aside className="hidden md:flex md:w-64 md:shrink-0 md:flex-col md:gap-6 md:border-r md:border-border md:bg-white md:px-4 md:py-6">
      <div className="px-2">
        <p className="text-section-title font-medium text-ink">Shohaz</p>
        <p className="truncate text-caption text-muted-foreground">{household.name}</p>
      </div>

      <nav className="flex flex-col gap-1" aria-label="Primary">
        {LINKS.map((link) => {
          const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
                active ? "bg-ink text-white" : "text-ink hover:bg-surface-muted"
              )}
            >
              <Icon name={link.icon} size={18} />
              {link.label}
            </Link>
          );
        })}
        <Link
          href="/review"
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
            pathname.startsWith("/review") ? "bg-ink text-white" : "text-ink hover:bg-surface-muted"
          )}
        >
          <Icon name="needsReview" size={18} />
          <span className="flex-1">Needs Review</span>
          <ReviewBadge count={summary.needsReviewCount} />
        </Link>
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-border pt-4">
        <SidebarLink href="/desktop" icon="activity" label="Activity Dashboard" pathname={pathname} />
        <SidebarLink href="/desktop/manage" icon="box" label="Manage" pathname={pathname} />
        <SidebarLink href="/settings/trash" icon="trash" label="Trash" pathname={pathname} />
        <SidebarLink href="/settings/import" icon="upload" label="Import CSV" pathname={pathname} />
        <SidebarLink href="/settings" icon="settings" label="Settings" pathname={pathname} />
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  icon,
  label,
  pathname,
}: {
  href: string;
  icon: IconName;
  label: string;
  pathname: string;
}) {
  const active = pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2 text-body",
        active ? "bg-ink text-white" : "text-ink hover:bg-surface-muted"
      )}
    >
      <Icon name={icon} size={18} />
      {label}
    </Link>
  );
}
