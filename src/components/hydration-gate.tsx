"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useInventoryStore } from "@/lib/store";

// Guaranteed-unauthenticated routes per src/proxy.ts's own PUBLIC_PATHS —
// hydrate() would just hit the "not signed in" branch here, so skip it
// entirely rather than waste a round trip.
const PUBLIC_PATHS = ["/sign-in", "/auth/callback"];

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
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <p className="text-body text-muted-foreground">Loading your household…</p>
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
