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
 *
 * Both arrays below are ordered in semantic clusters, not arrival order —
 * within a domain: more Browse (structural — "where does it physically
 * live"/"where does the money move") -> Views (filtered/curated slices of
 * what's already there) -> Reference (a catalog that ISN'T the
 * household's own data) -> Tools (bulk/utility actions). No visible
 * subheaders (DesktopSidebar renders each array as one flat list under a
 * single domain heading) — the grouping is adjacency-only, same
 * lower-risk approach as everywhere else in this file favors a smaller
 * diff over a bigger visual change. Inventory's own Locations/Needs
 * Review/Tags aren't in this array (see DesktopSidebar: Locations is the
 * domain's flagship — already the /more domain-card link, adding it here
 * too would duplicate that same card's own link on the very page it sits
 * on; Needs Review carries a live badge count LinkList can't render) —
 * they're that domain's fixed Browse-cluster head, unchanged by this
 * reordering.
 */
export const INVENTORY_LINKS: NavLink[] = [
  // Browse (continues past Locations/Needs Review/Tags above this array)
  { href: "/containers", icon: "archive", label: "Containers" },
  { href: "/home-map", icon: "pin", label: "Home Map" },
  // Views — curated/filtered slices of items already in the household
  { href: "/favorites", icon: "heart", label: "Favorites" },
  { href: "/wardrobe", icon: "grid", label: "Wardrobe" },
  // Unassigned (items with neither a Location nor a Container — genuinely
  // unfiled) had no nav entry anywhere in the app before this reorg, on
  // desktop or mobile — the same "real page, no path to it" gap this
  // array's own header comment describes fixing once already.
  { href: "/unassigned", icon: "mapPinOff", label: "Unassigned" },
  // Reference — the starter-inventory catalog, not the household's own items
  { href: "/reference", icon: "list", label: "Common Items" },
  // Tools
  { href: "/desktop", icon: "activity", label: "Activity Dashboard" },
  { href: "/desktop/manage", icon: "box", label: "Manage" },
  { href: "/desktop/labels", icon: "tag", label: "Label Printing" },
];

export const FINANCE_LINKS: NavLink[] = [
  // Overview
  { href: "/finance/dashboard", icon: "trendingUp", label: "Dashboard" },
  // Browse — the raw data: where the money sits, what moved
  { href: "/finance/accounts", icon: "wallet", label: "Accounts" },
  { href: "/finance/transactions", icon: "receipt", label: "Transactions" },
  // Views — planning & analysis built on top of that raw data
  { href: "/finance/recurring", icon: "repeat", label: "Recurring Bills" },
  { href: "/finance/budget", icon: "target", label: "Budget" },
  { href: "/finance/net-worth", icon: "trendingUp", label: "Net Worth" },
  // Tools — configuration, not a view of data itself (Inventory's
  // equivalent tail: Activity Dashboard/Manage/Label Printing)
  { href: "/finance/categories", icon: "pieChart", label: "Categories & Rules" },
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
