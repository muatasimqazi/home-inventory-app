// SubscriptionTier itself is canonically defined on Household in
// lib/types.ts (same convention as every other domain type) — re-exported
// here so existing call sites can keep importing it from @/lib/billing
// alongside the rest of the billing constants, without a second,
// independent copy of the same union type drifting from the real one.
import type { SubscriptionTier } from "@/lib/types";
export type { SubscriptionTier };

export const SUBSCRIPTION_TIERS: SubscriptionTier[] = ["free", "plus", "pro"];

export const PAID_SUBSCRIPTION_TIERS = ["plus", "pro"] as const;
export type PaidSubscriptionTier = (typeof PAID_SUBSCRIPTION_TIERS)[number];

export const BILLING_PLAN_LABEL: Record<SubscriptionTier, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
};

export const BILLING_PLAN_DESCRIPTION: Record<SubscriptionTier, string> = {
  free: "For trying Schuaz with one household.",
  plus: "For active households tracking inventory, receipts, and bills.",
  pro: "For larger households with heavier finance and automation needs.",
};

export const BILLING_PLAN_FEATURES: Record<SubscriptionTier, string[]> = {
  free: ["Household inventory", "Manual receipts and transactions", "Basic reminders"],
  plus: ["Everything in Free", "Bank transaction imports", "AI-assisted capture workflows", "Email receipt forwarding"],
  pro: ["Everything in Plus", "Larger storage and automation usage", "Priority support", "Advanced household workflows"],
};

export function isPaidSubscriptionTier(value: string): value is PaidSubscriptionTier {
  return (PAID_SUBSCRIPTION_TIERS as readonly string[]).includes(value);
}

export function subscriptionIsActive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
