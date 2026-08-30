"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * The mobile "how do I get back" affordance every non-tab-bar page needs.
 * Mobile's persistent chrome is exactly 5 destinations (Home, Search,
 * Settings, More, Scan — see bottom-nav.tsx's own LEFT_TABS/RIGHT_TABS) —
 * every other page is a drill-in with no chrome of its own to leave by
 * otherwise, unlike desktop, where the sidebar (desktop-sidebar.tsx) stays
 * visible and already links directly to every Locations/Tags/Review/
 * INVENTORY_LINKS/FINANCE_LINKS/SHARED_LINKS page.
 *
 * Pass `hideOnDesktop` for exactly those sidebar-linked pages, so this
 * doesn't sit redundantly next to chrome that already gets you there —
 * same `md:hidden` convention home-map/page.tsx and tags/page.tsx already
 * used before this was extracted. Leave the default (shown at every
 * width) for pages the sidebar doesn't reach directly — Settings'
 * own sub-pages, Finance's legacy /finance and /finance/import hubs,
 * single-record detail pages — where desktop has no other way back
 * either.
 *
 * router.back(), not a fixed destination — every page this is used on has
 * exactly one real entry surface in practice (the list/hub it drilled in
 * from), so the browser's own history already points at the right place
 * without this component needing to know what that is.
 */
export function BackButton({ className, hideOnDesktop = false }: { className?: string; hideOnDesktop?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Back"
      className={cn(
        "tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-sm",
        hideOnDesktop && "md:hidden",
        className
      )}
    >
      <Icon name="arrowLeft" size={18} />
    </button>
  );
}
