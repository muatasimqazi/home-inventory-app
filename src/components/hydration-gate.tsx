"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useInventoryStore } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";

// Guaranteed-unauthenticated routes per src/proxy.ts's own PUBLIC_PATHS —
// hydrate() would just hit the "not signed in" branch here, so skip it
// entirely rather than waste a round trip.
const PUBLIC_PATHS = ["/", "/sign-in", "/reset-password", "/privacy", "/terms", "/auth/callback"];

/**
 * Runs hydrate() once for every real route in the app — not just the
 * ones under (shell) — since several full-screen flows (/add, /capture,
 * /scan, /items/[id]) intentionally live outside that route group and
 * would otherwise call store actions before currentHouseholdId is ever
 * populated (a real bug caught in Stage 3 verification: an item created
 * on a fresh /add load raced ahead of hydration and was inserted with an
 * empty household_id, rejected by Postgres).
 */
export function HydrationGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHydrated = useInventoryStore((s) => s.isHydrated);
  const hydrationError = useInventoryStore((s) => s.hydrationError);
  const householdCount = useInventoryStore((s) => s.households.length);
  const hydrate = useInventoryStore((s) => s.hydrate);

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // household-setup is where a zero-household user is *supposed* to be —
  // it handles its own empty/loading state, so it's exempt from the
  // blocking gate and the redirect below (which would otherwise bounce
  // it right back to itself).
  const isHouseholdSetup = pathname === "/household-setup";

  useEffect(() => {
    if (!isPublic) hydrate();
  }, [isPublic, hydrate]);

  useEffect(() => {
    if (!isPublic && !isHouseholdSetup && isHydrated && !hydrationError && householdCount === 0) {
      router.replace("/household-setup");
    }
  }, [isPublic, isHouseholdSetup, isHydrated, hydrationError, householdCount, router]);

  if (isPublic || isHouseholdSetup) return <>{children}</>;

  if (!isHydrated) {
    // A skeleton shaped like the real app shell (app-shell.tsx/bottom-
    // nav.tsx), not a bare spinner — this is the first thing anyone sees
    // on every cold load, doubly so launched from a home-screen icon (no
    // Safari chrome to lend the page any context in the meantime), and it
    // used to be a static icon + "Loading your household…" with nothing
    // to look at. Static markup, not the real BottomNav/AppShell
    // components — those need live store/router data (pathname, contextual
    // scan href, etc.) that doesn't exist yet at this point.
    return (
      <div className="flex min-h-dvh w-full flex-col bg-background">
        <main className="w-full flex-1 px-5 pb-28 pt-[max(1.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-6">
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="size-9 rounded-full" />
            </div>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        </main>
        {/* Same min-h-17.5/border-t/px-2 shape as the real bottom nav, so
            there's no visible size jump once the real one mounts. */}
        <nav aria-hidden className="fixed inset-x-0 bottom-0 z-40 flex min-h-17.5 items-center border-t border-border bg-card px-2 pb-[env(safe-area-inset-bottom)] md:hidden">
          <div className="flex flex-1 items-center justify-around">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
          <Skeleton className="-mt-8 size-16 shrink-0 rounded-full" />
          <div className="flex flex-1 items-center justify-around">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </nav>
      </div>
    );
  }

  if (hydrationError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-background px-6 text-center">
        <p className="text-body font-medium text-ink">Couldn&apos;t load your data</p>
        <p className="text-caption text-muted-foreground">{hydrationError}</p>
      </div>
    );
  }

  if (householdCount === 0) {
    // Redirecting to /household-setup.
    return null;
  }

  return <>{children}</>;
}
