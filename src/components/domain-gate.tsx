"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { useInventoryStore } from "@/lib/store";
import { FINANCE_ROUTE_PREFIXES, INVENTORY_ROUTE_PREFIXES, matchesRoutePrefix } from "@/lib/domain-routes";

/**
 * Route-level enforcement of a household's domain choice
 * (0033_household_domains.sql) — hiding a disabled domain's nav entries
 * (lib/nav-links.ts, /more, DesktopSidebar, ScanChooserSheet) doesn't
 * stop someone reaching one of its pages directly (a bookmark, an old
 * push notification link, a scanned NFC/QR container tag), so this
 * redirects away from one instead of rendering it.
 *
 * Nested inside HydrationGate in layout.tsx, not a sibling of it — it
 * needs households/currentHouseholdId to actually be populated to have
 * anything to check, and HydrationGate is already the thing that
 * guarantees that (or exempts a route entirely, e.g. /sign-in) before
 * rendering children at all. This still degrades safely on its own if
 * that ever changes: no matching household just means nothing is
 * blocked, not a crash.
 */
export function DomainGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const households = useInventoryStore((s) => s.households);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const household = households.find((h) => h.id === currentHouseholdId);

  const blockedDomain = !household
    ? null
    : !household.financeEnabled && matchesRoutePrefix(pathname, FINANCE_ROUTE_PREFIXES)
      ? "Finance"
      : !household.inventoryEnabled && matchesRoutePrefix(pathname, INVENTORY_ROUTE_PREFIXES)
        ? "Inventory"
        : null;

  useEffect(() => {
    if (blockedDomain) {
      toast.error(`${blockedDomain} isn't enabled for this household.`);
      router.replace("/dashboard");
    }
  }, [blockedDomain, router]);

  // Render nothing rather than the blocked page for the one frame before
  // router.replace takes effect — same reasoning as HydrationGate's own
  // "Redirecting to /household-setup." null return.
  if (blockedDomain) return null;

  return <>{children}</>;
}
