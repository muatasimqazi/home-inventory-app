"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { useInventoryStore } from "@/lib/store";
import { ensureRevenueCatConfigured } from "@/lib/revenuecat-client";

/**
 * Native-app-only (iOS specifically — see revenuecat-client.ts's own
 * comment for why Android isn't wired up yet), mounted globally at the
 * root layout same as NativePushNotificationListener/NativeAuthDeepLink
 * Listener: RevenueCat needs to be configured with the current
 * household's id before settings/billing/page.tsx's purchase button can
 * ever be tapped, and configuring it lazily inside that page's own
 * effect would race a user opening Settings straight from a deep link,
 * before the household has necessarily finished hydrating elsewhere.
 * Also re-logs-in automatically if the current household changes (see
 * HouseholdSwitcher) — configuring once at the wrong household id would
 * silently attribute every subsequent purchase to it.
 */
export function NativeRevenueCatInit() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios" || !householdId) return;
    ensureRevenueCatConfigured(householdId).catch((error) => {
      console.error("NativeRevenueCatInit: couldn't configure RevenueCat:", error);
    });
  }, [householdId]);

  return null;
}
