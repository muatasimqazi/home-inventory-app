import "server-only";
import Stripe from "stripe";
import { isPaidSubscriptionTier, type PaidSubscriptionTier } from "@/lib/billing";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY must be set.");
  stripeClient = new Stripe(secretKey);
  return stripeClient;
}

export function stripePriceIdForTier(tier: PaidSubscriptionTier): string {
  const envName = tier === "plus" ? "STRIPE_PLUS_PRICE_ID" : "STRIPE_PRO_PRICE_ID";
  const priceId = process.env[envName];
  if (!priceId) throw new Error(`${envName} must be set.`);
  return priceId;
}

export function subscriptionTierForPriceId(priceId: string | null | undefined): PaidSubscriptionTier | null {
  const pairs = [
    ["plus", process.env.STRIPE_PLUS_PRICE_ID],
    ["pro", process.env.STRIPE_PRO_PRICE_ID],
  ] as const;
  const match = pairs.find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId);
  return match && isPaidSubscriptionTier(match[0]) ? match[0] : null;
}
