import type { IconName } from "@/components/icon";

export interface NavLink {
  href: string;
  icon: IconName;
  label: string;
}

/**
 * Single source of truth for each domain's sub-pages, shared between
 * DesktopSidebar (always visible, md+) and /more (the mobile-only domain
 * switcher). Before this existed, DesktopSidebar defined these arrays
 * locally and /more was hand-written with just two switcher cards — they
 * silently drifted apart, and four real pages (Favorites, Manage,
 * Categories & Rules, Net Worth) ended up reachable on desktop only, with
 * no path to them on mobile at all short of typing the URL. Add a page
 * here once and both surfaces pick it up.
 */
export const INVENTORY_LINKS: NavLink[] = [
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/wardrobe", icon: "grid", label: "Wardrobe" },
  { href: "/home-map", icon: "pin", label: "Home Map" },
  { href: "/reference", icon: "list", label: "Common Items" },
  { href: "/desktop", icon: "activity", label: "Activity Dashboard" },
  { href: "/desktop/manage", icon: "box", label: "Manage" },
  { href: "/desktop/labels", icon: "tag", label: "Label Printing" },
];

export const FINANCE_LINKS: NavLink[] = [
  { href: "/finance/dashboard", icon: "trendingUp", label: "Dashboard" },
  { href: "/finance/accounts", icon: "wallet", label: "Accounts" },
  { href: "/finance/transactions", icon: "receipt", label: "Transactions" },
  { href: "/finance/budget", icon: "target", label: "Budget" },
  { href: "/finance/categories", icon: "pieChart", label: "Categories & Rules" },
  { href: "/finance/recurring", icon: "repeat", label: "Recurring Bills" },
  { href: "/finance/net-worth", icon: "trendingUp", label: "Net Worth" },
];

// Activity/Trash/Import CSV/Search were consolidated into one shared page
// each (docs note: Trash keeps two tabbed panels, Activity a real combined
// feed) rather than living duplicated in both domains. On mobile these
// live on /settings instead of here — Settings is the one already-reachable
// surface that lists them (see app/(shell)/settings/page.tsx) — so this
// array isn't rendered on /more to avoid re-duplicating them a second way.
export const SHARED_LINKS: NavLink[] = [
  { href: "/search", icon: "search", label: "Search" },
  { href: "/activity", icon: "activity", label: "Activity" },
  { href: "/trash", icon: "trash", label: "Trash" },
  { href: "/import", icon: "upload", label: "Import CSV" },
];
