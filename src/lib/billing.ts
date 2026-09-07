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

// Free-tier resource caps (docs/Free Tier Limits Addendum.md). The real
// enforcement is database-level — supabase/migrations/0057_free_tier_
// resource_limits.sql's triggers/RPC duplicate these same numbers in SQL,
// since a migration can't import this module — these exports exist so the
// client-side pre-check (lib/store.ts) and any UI copy stay in sync with
// each other, not with the database. Keep both sides in sync by hand if
// these ever change. Paid tiers (Plus, Pro) are unconditionally unlimited
// on all three.
export const FREE_TIER_LOCATION_LIMIT = 3;
export const FREE_TIER_ITEM_LIMIT = 100;
export const FREE_TIER_STUDIO_GENERATIONS_PER_MONTH = 10;

export function subscriptionIsActive(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}
