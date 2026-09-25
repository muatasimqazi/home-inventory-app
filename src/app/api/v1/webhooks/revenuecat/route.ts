import { NextResponse } from "next/server";
import { tierForEntitlementIds } from "@/lib/revenuecat";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * RevenueCat's webhook payload shape (https://www.revenuecat.com/docs/
 * integrations/webhooks/event-types-and-fields) — only the fields this
 * route actually reads, not the full schema.
 */
interface RevenueCatEvent {
  type: string;
  app_user_id: string;
  product_id: string | null;
  entitlement_ids: string[] | null;
  expiration_at_ms: number | null;
  original_transaction_id: string | null;
  environment: "SANDBOX" | "PRODUCTION";
}

// Event types that mean "this household has (or still has) an active
// paid entitlement right now" — apply the new tier and mark active.
// "RESTORE" is deliberately NOT in this list — RevenueCat has no such
// webhook event (checked their current docs directly: https://www.
// revenuecat.com/docs/integrations/webhooks/event-types-and-fields).
// Restoring an already-active purchase produces no new event at all;
// restoring one that moves to a different app_user_id sends TRANSFER
// instead, which this route currently just acknowledges as a no-op
// (see EXPIRED_EVENT_TYPES' own comment) rather than something worth
// half-handling.
//
// PRODUCT_CHANGE is deliberately NOT in this list either: its
// product_id/entitlement_ids/expiration_at_ms all describe the product
// being switched *from*, and RevenueCat's own docs say to treat it as
// informational only (https://www.revenuecat.com/docs/subscription-
// guidance/managing-subscriptions). An App Store upgrade sends it
// alongside a RENEWAL for the new product, milliseconds apart and in no
// guaranteed order — handling it here wrote Plus back over Pro whenever
// it landed second (seen live: a Plus → Pro upgrade that never showed
// as Pro). A deferred downgrade likewise takes effect via the RENEWAL
// at the period boundary, not this event.
const ACTIVE_EVENT_TYPES = new Set(["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "NON_RENEWING_PURCHASE"]);

// CANCELLATION only turns off auto-renew — same as a Stripe subscription
// with cancel_at_period_end: the household keeps its current tier until
// the period actually ends, handled in its own branch below (sets
// subscription_cancel_at_period_end, deliberately leaves tier/status
// alone). Only EXPIRATION means the entitlement is actually gone right
// now. Everything else (PRODUCT_CHANGE, BILLING_ISSUE, TRANSFER, SUBSCRIPTION_PAUSED,
// TEST, …) is acknowledged but doesn't change anything here — a failed
// renewal charge still has a grace period before Apple itself expires
// the entitlement, at which point RevenueCat sends a real EXPIRATION.
const EXPIRED_EVENT_TYPES = new Set(["EXPIRATION"]);
const CANCELLED_EVENT_TYPES = new Set(["CANCELLATION"]);

/**
 * Keeps households.subscription_tier in sync for the iOS In-App
 * Purchase path (0060_apple_iap_billing.sql) — the Apple counterpart to
 * webhooks/stripe/route.ts's syncSubscription(). app_user_id is the
 * household id directly (RevenueCat is configured client-side with
 * appUserID: household.id — the same "one owner pays for the shared
 * household workspace" model Stripe already uses), so no id-mapping
 * lookup is needed, unlike a typical per-user RevenueCat integration.
 *
 * billing_provider guards against this webhook clobbering a household
 * that's actually paying through Stripe: an EXPIRATION from Apple only
 * downgrades the household to free if Apple is the provider that's
 * currently marked as owning its subscription. An active-type event
 * always applies, since a real new purchase should always win.
 */
export async function POST(request: Request) {
  const webhookSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "RevenueCat webhook secret is not configured." }, { status: 500 });

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${webhookSecret}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let body: { event?: RevenueCatEvent };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const event = body.event;
  if (!event?.app_user_id || !event.type) return NextResponse.json({ error: "Missing event.app_user_id or event.type." }, { status: 400 });

  // Sandbox events (RevenueCat/App Store Connect test purchases —
  // TestFlight review included) hit the same endpoint as real ones;
  // never let a reviewer's test purchase grant real production access.
  if (event.environment === "SANDBOX" && process.env.NODE_ENV === "production" && process.env.REVENUECAT_ACCEPT_SANDBOX !== "true") {
    return NextResponse.json({ received: true, skipped: "sandbox" });
  }

  const householdId = event.app_user_id;
  const admin = getSupabaseAdminClient();
  console.log(`webhooks/revenuecat: ${event.type} for ${householdId} (product ${event.product_id}, entitlements ${event.entitlement_ids}, ${event.environment})`);

  try {
    if (ACTIVE_EVENT_TYPES.has(event.type)) {
      const tier = tierForEntitlementIds(event.entitlement_ids, event.product_id);
      if (!tier) {
        console.error(`webhooks/revenuecat: no known tier for product ${event.product_id}/entitlements ${event.entitlement_ids}`);
        return NextResponse.json({ received: true, skipped: "unknown product" });
      }
      const { error } = await admin
        .from("households")
        .update({
          subscription_tier: tier,
          subscription_status: "active",
          billing_provider: "apple",
          apple_original_transaction_id: event.original_transaction_id,
          subscription_current_period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
          subscription_updated_at: new Date().toISOString(),
          // Any of these event types means auto-renew is (or is back to
          // being) on — including UNCANCELLATION itself, which is
          // literally "a cancelled subscription was re-enabled."
          subscription_cancel_at_period_end: false,
        })
        .eq("id", householdId);
      if (error) throw new Error(error.message);
    } else if (EXPIRED_EVENT_TYPES.has(event.type)) {
      const { error } = await admin
        .from("households")
        .update({
          subscription_tier: "free",
          subscription_status: "expired",
          subscription_current_period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
          subscription_updated_at: new Date().toISOString(),
          subscription_cancel_at_period_end: false,
        })
        .eq("id", householdId)
        .eq("billing_provider", "apple"); // don't clobber a Stripe-owned subscription
      if (error) throw new Error(error.message);
    } else if (CANCELLED_EVENT_TYPES.has(event.type)) {
      // Deliberately touches nothing but this one flag — the household
      // keeps its current tier/status until the period actually ends
      // (EXPIRATION above). Confirmed live: RevenueCat's CANCELLATION
      // payload for this exact scenario carries entitlement_ids/
      // product_id still reflecting the CURRENT plan, so there was
      // never a real "what tier" question here, only "should the UI
      // show this is about to end" — which is what this flag answers.
      const { error } = await admin
        .from("households")
        .update({ subscription_cancel_at_period_end: true, subscription_updated_at: new Date().toISOString() })
        .eq("id", householdId)
        .eq("billing_provider", "apple"); // don't clobber a Stripe-owned subscription
      if (error) throw new Error(error.message);
    }
    // Every other event type (PRODUCT_CHANGE, BILLING_ISSUE, TRANSFER, SUBSCRIPTION_PAUSED,
    // TEST, …) is intentionally a no-op here — see the constants' own
    // comments above.
  } catch (error) {
    console.error("webhooks/revenuecat: couldn't sync subscription:", error);
    return NextResponse.json({ error: "Couldn't sync subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
