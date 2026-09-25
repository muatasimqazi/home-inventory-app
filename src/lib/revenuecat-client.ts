"use client";

import { Purchases } from "@revenuecat/purchases-capacitor";
import type { PaidSubscriptionTier } from "@/lib/billing";

// Package identifiers chosen in the RevenueCat dashboard to match — see
// supabase/migrations/0060_apple_iap_billing.sql's own comment for why
// the RevenueCat "app user id" is the household id, not a per-user id.
const PACKAGE_ID_FOR_TIER: Record<PaidSubscriptionTier, string> = {
  plus: "plus_monthly",
  pro: "pro_monthly",
};

let configuredForHouseholdId: string | null = null;

/**
 * Configures (or re-logs-in) the RevenueCat SDK for the current
 * household — iOS only for now (Android keeps using the existing
 * Stripe-via-browser flow; see settings/billing/page.tsx's own
 * startCheckout() for why). Safe to call repeatedly, including on every
 * household switch: configure() is a one-time SDK init, logIn() is the
 * cheap "same SDK instance, different app user id" call after that —
 * this picks the right one and no-ops entirely if the household hasn't
 * actually changed.
 */
export async function ensureRevenueCatConfigured(householdId: string): Promise<void> {
  if (configuredForHouseholdId === householdId) return;

  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    console.error("ensureRevenueCatConfigured: NEXT_PUBLIC_REVENUECAT_IOS_API_KEY is not set.");
    return;
  }

  if (configuredForHouseholdId === null) {
    await Purchases.configure({ apiKey, appUserID: householdId });
  } else {
    await Purchases.logIn({ appUserID: householdId });
  }
  configuredForHouseholdId = householdId;
}

export interface PurchaseOutcome {
  ok: boolean;
  /** True when the user backed out of the native purchase sheet — not a real error, shouldn't show an error toast. */
  cancelled?: boolean;
  error?: string;
}

/**
 * Buys the given tier's package via StoreKit (fetches the current
 * RevenueCat offering, finds the matching package, purchases it). Does
 * NOT itself update households.subscription_tier — that's
 * webhooks/revenuecat/route.ts's job once RevenueCat's webhook fires,
 * same "server is the source of truth" shape the Stripe path already
 * has. The caller (settings/billing/page.tsx) polls the household row
 * briefly afterward for a responsive UI instead of waiting on a full
 * page reload.
 */
export async function purchaseTier(tier: PaidSubscriptionTier): Promise<PurchaseOutcome> {
  try {
    const { current } = await Purchases.getOfferings();
    if (!current) return { ok: false, error: "No plans are available to purchase right now." };

    const packageId = PACKAGE_ID_FOR_TIER[tier];
    const pkg = current.availablePackages.find((p) => p.identifier === packageId);
    if (!pkg) return { ok: false, error: "That plan isn't set up for purchase yet." };

    // No Purchases.syncPurchases() call after this on purpose — its own
    // doc comment explicitly warns it "should only be called if you're
    // not calling purchase[...]Package". purchasePackage() already
    // reports the transaction to RevenueCat itself; syncPurchases() here
    // would be redundant against that warning, not a fix for anything
    // (confirmed live: the webhook path already updates the household
    // correctly on its own — the real bug traced to the app never
    // re-reading that update, fixed instead by NativeRevenueCatInit's
    // CustomerInfo listener and this page's own refresh-on-mount).
    await Purchases.purchasePackage({ aPackage: pkg });
    return { ok: true };
  } catch (error) {
    // RevenueCat's cancellation errors carry userCancelled: true. The SDK
    // docs recommend checking `code === PURCHASES_ERROR_CODE.
    // PURCHASE_CANCELLED_ERROR` instead (userCancelled is deprecated),
    // but that enum lives in @revenuecat/purchases-typescript-internal-esm,
    // a transitive dependency this package doesn't re-export or declare
    // directly — not worth a second direct dependency just for one enum
    // value when the deprecated field does the same job.
    const userCancelled = typeof error === "object" && error !== null && "userCancelled" in error && (error as { userCancelled?: boolean }).userCancelled === true;
    if (userCancelled) return { ok: false, cancelled: true };
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't complete the purchase." };
  }
}

export async function restorePurchases(): Promise<PurchaseOutcome> {
  try {
    // Same reasoning as purchaseTier() above for not also calling
    // syncPurchases() here — restorePurchases() already re-syncs the
    // device's App Store transactions with RevenueCat as its whole job.
    await Purchases.restorePurchases();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't restore purchases." };
  }
}
