import { NextResponse } from "next/server";
import { fetchAppleBillingState } from "@/lib/revenuecat";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * RevenueCat's webhook payload shape (https://www.revenuecat.com/docs/
 * integrations/webhooks/event-types-and-fields) — only the fields this
 * route actually reads, not the full schema. app_user_id is absent on
 * TRANSFER, which carries transferred_from/transferred_to instead.
 */
interface RevenueCatEvent {
  type: string;
  app_user_id?: string;
  transferred_from?: string[];
  transferred_to?: string[];
  original_transaction_id?: string | null;
  product_id?: string | null;
  entitlement_ids?: string[] | null;
  environment?: "SANDBOX" | "PRODUCTION";
}

// Household ids are uuids; RevenueCat app user ids on the other side of a
// TRANSFER can also be anonymous ($RCAnonymousID:…) ids that were never a
// household — those have no row to sync.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Keeps households.subscription_tier in sync for the iOS In-App
 * Purchase path (0060_apple_iap_billing.sql) — the Apple counterpart to
 * webhooks/stripe/route.ts's syncSubscription(). app_user_id is the
 * household id directly (RevenueCat is configured client-side with
 * appUserID: household.id — the same "one owner pays for the shared
 * household workspace" model Stripe already uses).
 *
 * The event itself is treated only as "this household's subscription
 * changed somehow" — the actual tier/period/cancel state comes from
 * RevenueCat's own current view of the customer (fetchAppleBillingState).
 * Deriving it from each event's payload was wrong three separate ways,
 * all seen live: PRODUCT_CHANGE carries the product being switched
 * *from* and races the RENEWAL for the new one on an upgrade (Plus
 * overwrote Pro); TRANSFER (an Apple ID's purchases moving between
 * households) carries no product or even app_user_id and was being
 * rejected outright; and with two parallel subscriptions a renewal of
 * the lower one would overwrite the higher. Re-reading current state
 * makes every event idempotent and order-independent.
 *
 * billing_provider guards against this webhook clobbering a household
 * that's actually paying through Stripe: losing Apple access only
 * downgrades the household to free if Apple is the provider currently
 * marked as owning its subscription. Having an active Apple entitlement
 * always applies, since a real purchase should always win.
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
  if (!event?.type) return NextResponse.json({ error: "Missing event.type." }, { status: 400 });

  const householdIds = (event.type === "TRANSFER" ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])] : [event.app_user_id ?? ""]).filter((id) =>
    UUID_PATTERN.test(id)
  );
  console.log(
    `webhooks/revenuecat: ${event.type} for ${householdIds.join(", ") || "(no household ids)"} (product ${event.product_id ?? "-"}, entitlements ${event.entitlement_ids ?? "-"}, ${event.environment ?? "-"})`
  );

  // Sandbox events (RevenueCat/App Store Connect test purchases —
  // TestFlight review included) hit the same endpoint as real ones;
  // never let a reviewer's test purchase grant real production access.
  // fetchAppleBillingState applies the same rule to the sandbox
  // purchases it reads back, since a TRANSFER doesn't always say which
  // environment it came from.
  const acceptSandbox = process.env.NODE_ENV !== "production" || process.env.REVENUECAT_ACCEPT_SANDBOX === "true";
  if (event.environment === "SANDBOX" && !acceptSandbox) {
    return NextResponse.json({ received: true, skipped: "sandbox" });
  }
  // Dashboard "send test event" — its app_user_id isn't a real customer,
  // and looking one up via the REST API would create it.
  if (event.type === "TEST") return NextResponse.json({ received: true, skipped: "test" });

  const admin = getSupabaseAdminClient();
  try {
    for (const householdId of householdIds) {
      const state = await fetchAppleBillingState(householdId, { acceptSandbox });
      console.log(`webhooks/revenuecat: ${householdId} is now ${state.tier ?? "free"}${state.cancelAtPeriodEnd ? " (cancels at period end)" : ""}`);
      const now = new Date().toISOString();

      if (state.tier) {
        const { error } = await admin
          .from("households")
          .update({
            subscription_tier: state.tier,
            subscription_status: "active",
            billing_provider: "apple",
            ...(event.original_transaction_id ? { apple_original_transaction_id: event.original_transaction_id } : {}),
            subscription_current_period_end: state.currentPeriodEnd,
            subscription_cancel_at_period_end: state.cancelAtPeriodEnd,
            subscription_updated_at: now,
          })
          .eq("id", householdId);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await admin
          .from("households")
          .update({ subscription_tier: "free", subscription_status: "expired", subscription_cancel_at_period_end: false, subscription_updated_at: now })
          .eq("id", householdId)
          .eq("billing_provider", "apple") // don't clobber a Stripe-owned subscription
          .neq("subscription_tier", "free"); // nothing to downgrade — leave the row (and its timestamps) alone
        if (error) throw new Error(error.message);
      }
    }
  } catch (error) {
    // A 5xx makes RevenueCat retry — right for a transient RevenueCat/
    // Supabase failure, and for a missing REVENUECAT_SECRET_API_KEY once
    // it's configured.
    console.error("webhooks/revenuecat: couldn't sync subscription:", error);
    return NextResponse.json({ error: "Couldn't sync subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
