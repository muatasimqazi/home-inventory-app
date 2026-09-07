import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isPaidSubscriptionTier, FREE_TIER_STUDIO_GENERATIONS_PER_MONTH } from "@/lib/billing";
import type { SubscriptionTier } from "@/lib/types";

export type StudioGenerationQuotaResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Real per-household cap on AI studio-image generations for Free
 * households (docs/Free Tier Limits Addendum.md) — generate-studio-photo,
 * generate-location-photo, and remove-background each make a real,
 * billed model call, so Free needs a hard monthly ceiling on top of (not
 * instead of) the per-user abuse throttle in lib/rate-limit.ts. Paid
 * tiers are unconditionally unlimited and never touch the counter.
 *
 * Call this once per actual generation attempt, not once per HTTP
 * request — generate-studio-photo's route can request up to 3 styles in
 * one call, so it calls this once per style, inside its loop, so a
 * household that's part-way through its quota gets exactly as many
 * generations as it has left rather than an all-or-nothing reject.
 *
 * Consumes on success (the whole point is to cap real spend, not just
 * report it) via the atomic try_increment_studio_generation_usage()
 * Postgres function — security definer, since any household member can
 * trigger a generation but only the owner can UPDATE households
 * directly under RLS.
 */
export async function checkAndConsumeStudioGenerationQuota(householdId: string): Promise<StudioGenerationQuotaResult> {
  const supabase = await getSupabaseServerClient();

  const { data: household } = await supabase.from("households").select("subscription_tier").eq("id", householdId).maybeSingle();
  const tier = household?.subscription_tier as SubscriptionTier | undefined;
  if (tier && isPaidSubscriptionTier(tier)) return { ok: true };

  const { data: allowed, error } = await supabase.rpc("try_increment_studio_generation_usage", {
    p_household_id: householdId,
    p_limit: FREE_TIER_STUDIO_GENERATIONS_PER_MONTH,
  });
  if (error) {
    console.error("checkAndConsumeStudioGenerationQuota: rpc failed:", error);
    return { ok: false, error: "Couldn't check your plan's usage. Please try again.", status: 502 };
  }
  if (!allowed) {
    return {
      ok: false,
      error: `Free plan includes ${FREE_TIER_STUDIO_GENERATIONS_PER_MONTH} AI photo generations a month. Upgrade to Plus for unlimited.`,
      status: 402,
    };
  }
  return { ok: true };
}
