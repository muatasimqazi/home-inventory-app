import "server-only";
import { isPaidSubscriptionTier, type PaidSubscriptionTier } from "@/lib/billing";

/** What RevenueCat itself currently says one app user id (= one household
 * id) is entitled to — see fetchAppleBillingState(). `tier: null` means no
 * active paid entitlement at all. */
export interface AppleBillingState {
  tier: PaidSubscriptionTier | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface RevenueCatSubscriberResponse {
  subscriber: {
    entitlements: Record<string, { expires_date: string | null; grace_period_expires_date: string | null; product_identifier: string }>;
    subscriptions: Record<string, { unsubscribe_detected_at: string | null; is_sandbox: boolean }>;
  };
}

/**
 * Reads the subscriber's current entitlements from RevenueCat's REST API
 * (https://www.revenuecat.com/docs/api-v1/customers) rather than trusting
 * any single webhook event's payload — which is what RevenueCat itself
 * recommends, and what webhooks/revenuecat/route.ts relies on: an event
 * describes one transaction, not the customer's overall state, so
 * deriving the tier from each event separately got it wrong whenever
 * events raced (PRODUCT_CHANGE vs RENEWAL on an upgrade), carried no
 * product at all (TRANSFER), or described one of two parallel
 * subscriptions. The highest active tier wins — entitlement identifiers
 * were set up in the RevenueCat dashboard as the literal strings
 * "plus"/"pro" (same as SubscriptionTier), so they match directly.
 *
 * `acceptSandbox: false` ignores sandbox purchases entirely — same rule
 * the webhook route already applies to sandbox events in production.
 */
export async function fetchAppleBillingState(appUserId: string, { acceptSandbox }: { acceptSandbox: boolean }): Promise<AppleBillingState> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (!apiKey) throw new Error("REVENUECAT_SECRET_API_KEY is not configured.");

  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed (${response.status}).`);
  const { subscriber } = (await response.json()) as RevenueCatSubscriberResponse;

  const now = Date.now();
  let best: { tier: PaidSubscriptionTier; expiresDate: string | null; productId: string } | null = null;
  for (const [entitlementId, entitlement] of Object.entries(subscriber.entitlements ?? {})) {
    if (!isPaidSubscriptionTier(entitlementId)) continue;
    const accessUntil = entitlement.grace_period_expires_date ?? entitlement.expires_date;
    if (accessUntil !== null && new Date(accessUntil).getTime() <= now) continue;
    const subscription = subscriber.subscriptions?.[entitlement.product_identifier];
    if (subscription?.is_sandbox && !acceptSandbox) continue;
    if (!best || (entitlementId === "pro" && best.tier !== "pro")) {
      best = { tier: entitlementId as PaidSubscriptionTier, expiresDate: entitlement.expires_date, productId: entitlement.product_identifier };
    }
  }

  if (!best) return { tier: null, currentPeriodEnd: null, cancelAtPeriodEnd: false };
  return {
    tier: best.tier,
    currentPeriodEnd: best.expiresDate,
    cancelAtPeriodEnd: Boolean(subscriber.subscriptions?.[best.productId]?.unsubscribe_detected_at),
  };
}
