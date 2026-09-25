"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
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

  // Confirmed live: the households row was updating correctly (the
  // webhook path works), but the app itself kept showing the old plan —
  // settings/billing/page.tsx's post-purchase poll only ever runs for a
  // purchase made through its own button, so a transaction StoreKit
  // reports through any other path (a sandbox tester purchasing outside
  // the app, a renewal while the app wasn't open, App Review's own
  // testing) never told the store to re-fetch. RevenueCat pushes a
  // fresh CustomerInfo on exactly those cases — this reacts to that
  // directly rather than only to a purchase this app itself initiated.
  // Registered once at mount (not per household change): the callback
  // reads the current household id fresh via getState() each time it
  // fires, so it's never working off a stale closure.
  useEffect(() => {
    if (Capacitor.getPlatform() !== "ios") return;
    let listenerId: string | undefined;
    Purchases.addCustomerInfoUpdateListener(() => {
      const currentHouseholdId = useInventoryStore.getState().currentHouseholdId;
      if (currentHouseholdId) void useInventoryStore.getState().refreshHouseholdBilling(currentHouseholdId);
    })
      .then((id) => {
        listenerId = id;
      })
      .catch((error) => {
        console.error("NativeRevenueCatInit: couldn't add CustomerInfo listener:", error);
      });
    return () => {
      if (listenerId) void Purchases.removeCustomerInfoUpdateListener({ listenerToRemove: listenerId });
    };
  }, []);

  return null;
}
