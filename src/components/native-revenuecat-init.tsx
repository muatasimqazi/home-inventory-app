"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Purchases } from "@revenuecat/purchases-capacitor";
import { useInventoryStore } from "@/lib/store";
import { ensureRevenueCatConfigured } from "@/lib/revenuecat-client";

const BILLING_FOLLOW_UP_REFRESH_MS = 4000;

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
      refreshCurrentHouseholdBilling();
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

  // Neither of the above covers returning from the background: the
  // Realtime households subscription's WebSocket drops while the WebView
  // is suspended and Supabase doesn't replay what it missed, the billing
  // page is still mounted so its refresh-on-mount doesn't re-run, and
  // RevenueCat only re-fetches CustomerInfo on foreground once its cache
  // is stale. Exactly the path a user takes to cancel in iOS Settings →
  // Subscriptions (or, on Android, returning from the Stripe portal's
  // Custom Tab) — so re-read the household row on every resume. All
  // native platforms, not just iOS: nothing here is RevenueCat-specific.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = App.addListener("resume", () => {
      refreshCurrentHouseholdBilling();
    });
    return () => {
      void handle.then((h) => h.remove());
    };
  }, []);

  return null;
}

/** Webhook-driven, so the households row usually lags whatever just
 * triggered this by a few seconds (RevenueCat pushes CustomerInfo the
 * moment StoreKit finishes, before its own webhook has landed; on
 * resume, Realtime takes a moment to reconnect) — a second read shortly
 * after catches that window. Anything later than that arrives through
 * the Realtime households subscription once it's reconnected. Reads the
 * current household id fresh each time rather than from a closure. */
function refreshCurrentHouseholdBilling() {
  const refresh = () => {
    const { currentHouseholdId, refreshHouseholdBilling } = useInventoryStore.getState();
    if (currentHouseholdId) void refreshHouseholdBilling(currentHouseholdId);
  };
  refresh();
  setTimeout(refresh, BILLING_FOLLOW_UP_REFRESH_MS);
}
