/**
 * Route-level counterpart to lib/nav-links.ts's domain gating
 * (0033_household_domains.sql) — nav-links.ts only lists each domain's
 * *sub*-pages (the ones that would otherwise have no other reachable
 * path), not the core CRUD routes (items, locations, containers, tags,
 * capture) or the routes that live outside the (shell) route group
 * (/add, /capture/*, /finance/scan/*, /items/[id]). Hiding a domain's nav
 * entries doesn't stop someone reaching one of those by URL — a bookmark,
 * a push notification link, an old NFC/QR tag — so this is the full list
 * DomainGate (components/domain-gate.tsx) actually redirects on.
 *
 * Prefix-matched (a route matches if pathname === prefix or pathname
 * starts with `${prefix}/`), not exact — most of these are one path
 * standing in for a whole subtree (`/finance` covers every
 * /finance/accounts/[id]-shaped route under it).
 *
 * Deliberately NOT listed, because they're genuinely cross-domain and
 * shouldn't be gated at all: / (Overview — already conditionally renders
 * each domain's own section), /more, /search, /activity, /trash, /import
 * (the chooser — its two destinations are listed below individually),
 * /settings and its other sub-pages, /people/[id], /household-setup,
 * /sign-in, /auth/callback.
 */
export const FINANCE_ROUTE_PREFIXES = ["/finance"];

export const INVENTORY_ROUTE_PREFIXES = [
  "/locations",
  "/containers",
  "/tags",
  "/items",
  "/add",
  "/capture",
  "/scan",
  "/reference",
  "/review",
  "/unassigned",
  "/favorites",
  "/home-map",
  "/desktop",
  "/c",
  // Not /settings as a whole (shared) — just its inventory-CSV sub-page.
  // /finance/import is Finance's own equivalent, already covered by the
  // plain "/finance" prefix above.
  "/settings/import",
];

export function matchesRoutePrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
