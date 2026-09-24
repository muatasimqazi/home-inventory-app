import "server-only";
import { isPaidSubscriptionTier, type PaidSubscriptionTier } from "@/lib/billing";

/**
 * Product id -> tier mapping, same shape as lib/stripe.ts's
 * subscriptionTierForPriceId — kept as a static map (not env-driven like
 * Stripe's price ids) because App Store Connect product ids are public,
 * stable strings chosen once at creation, not secrets that rotate
 * between environments.
 */
const PRODUCT_ID_TIER: Record<string, PaidSubscriptionTier> = {
  "com.schuaz.app.plus.monthly": "plus",
  "com.schuaz.app.pro.monthly": "pro",
};

export function tierForProductId(productId: string | null | undefined): PaidSubscriptionTier | null {
  if (!productId) return null;
  return PRODUCT_ID_TIER[productId] ?? null;
}

/**
 * Prefers RevenueCat's own entitlement_ids over parsing product_id —
 * entitlement identifiers were deliberately set up in the RevenueCat
 * dashboard to be the literal strings "plus"/"pro" (same as
 * SubscriptionTier), so this is a direct match, not a lookup, and stays
 * correct even if a product id ever gets renamed. Falls back to
 * product_id only for event types that don't carry entitlement_ids.
 * The highest tier wins if somehow more than one is present.
 */
export function tierForEntitlementIds(entitlementIds: string[] | null | undefined, productId: string | null | undefined): PaidSubscriptionTier | null {
  const fromEntitlements = (entitlementIds ?? []).find(isPaidSubscriptionTier) as PaidSubscriptionTier | undefined;
  if (fromEntitlements === "pro") return "pro";
  if (fromEntitlements) return fromEntitlements;
  return tierForProductId(productId);
}
