import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import Stripe from "stripe";
import { BILLING_PLAN_LABEL, isPaidSubscriptionTier, type PaidSubscriptionTier } from "@/lib/billing";
import { requireHouseholdOwner } from "@/lib/authorize";
import { getStripeClient, stripePriceIdForTier } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/urls";

export const runtime = "nodejs";
const CHECKOUT_INTEGRATION_PREFIX = "schuaz-billing";

interface HouseholdBillingRow {
  id: string;
  name: string;
  stripe_customer_id: string | null;
}

/**
 * Starts Stripe Checkout for a household plan. Billing is household-level:
 * one Owner manages payment, every member gets the resulting entitlement.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId: rawHouseholdId, tier } = (body ?? {}) as { householdId?: unknown; tier?: unknown };
  if (typeof rawHouseholdId !== "string" || !rawHouseholdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  if (typeof tier !== "string" || !isPaidSubscriptionTier(tier)) return NextResponse.json({ error: "`tier` must be plus or pro." }, { status: 400 });
  // Re-bound to its own const below the narrowing check — TS doesn't carry
  // a typeof-narrowed type into the nested createCustomer/startCheckout
  // functions further down, which closed over the original (still
  // `unknown`-typed) destructured binding otherwise.
  const householdId: string = rawHouseholdId;

  const auth = await requireHouseholdOwner(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data: household, error: householdError } = await admin.from("households").select("id, name, stripe_customer_id").eq("id", householdId).single();
  if (householdError || !household) return NextResponse.json({ error: "Household not found." }, { status: 404 });

  const { data: member } = await admin.from("members").select("email, display_name").eq("household_id", householdId).eq("user_id", auth.userId).maybeSingle();
  const stripe = getStripeClient();
  const selectedTier = tier as PaidSubscriptionTier;

  async function createCustomer(): Promise<string> {
    const customer = await stripe.customers.create({
      email: typeof member?.email === "string" ? member.email : undefined,
      name: typeof member?.display_name === "string" ? member.display_name : undefined,
      metadata: { householdId },
    });
    await admin.from("households").update({ stripe_customer_id: customer.id, subscription_updated_at: new Date().toISOString() }).eq("id", householdId);
    return customer.id;
  }

  // Neither call here was ever wrapped — a real Stripe error (a stale
  // customer id from a since-switched test/live key pair, a declined
  // card, whatever) crashed the whole route unhandled, and Next.js's own
  // generic error response has no JSON body, which is what actually
  // produced the confusing client-side "Unexpected end of JSON input" —
  // not a hint about what went wrong at all. Caught live: a household's
  // stripe_customer_id stored from testing under one Stripe key pair
  // doesn't exist under a different one (test and live mode don't share
  // customer objects, even when product/price ids happen to). Recovers
  // from exactly that one case — a stale/missing customer id — by
  // creating a fresh customer and retrying once; any other error just
  // gets reported clearly instead of crashing.
  try {
    let customerId = (household as HouseholdBillingRow).stripe_customer_id ?? (await createCustomer());

    async function startCheckout() {
      return stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        client_reference_id: householdId,
        integration_identifier: `${CHECKOUT_INTEGRATION_PREFIX}-${randomBytes(4).toString("hex")}`,
        // Wasn't set at all — Checkout showed no promo code field, so
        // there was nowhere to redeem a Stripe promotion code. This is
        // the whole fix: Stripe's own hosted Checkout page handles entry,
        // validation, and applying the discount to the resulting
        // subscription — no app-side UI or logic needed.
        allow_promotion_codes: true,
        line_items: [{ price: stripePriceIdForTier(selectedTier), quantity: 1 }],
        metadata: { householdId, tier: selectedTier },
        subscription_data: { metadata: { householdId, tier: selectedTier } },
        success_url: `${appOrigin()}/settings/billing?checkout=success`,
        cancel_url: `${appOrigin()}/settings/billing?checkout=cancelled`,
      });
    }

    let session;
    try {
      session = await startCheckout();
    } catch (error) {
      const isStaleCustomer = error instanceof Stripe.errors.StripeInvalidRequestError && error.param === "customer" && error.code === "resource_missing";
      if (!isStaleCustomer) throw error;
      customerId = await createCustomer();
      session = await startCheckout();
    }

    if (!session.url) return NextResponse.json({ error: `Couldn't start ${BILLING_PLAN_LABEL[selectedTier]} checkout.` }, { status: 502 });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("billing/checkout: Stripe call failed:", error);
    const message = error instanceof Stripe.errors.StripeError ? error.message : `Couldn't start ${BILLING_PLAN_LABEL[selectedTier]} checkout.`;
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
