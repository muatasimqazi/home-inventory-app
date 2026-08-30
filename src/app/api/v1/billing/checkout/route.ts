import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
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

  const { householdId, tier } = (body ?? {}) as { householdId?: unknown; tier?: unknown };
  if (typeof householdId !== "string" || !householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });
  if (typeof tier !== "string" || !isPaidSubscriptionTier(tier)) return NextResponse.json({ error: "`tier` must be plus or pro." }, { status: 400 });

  const auth = await requireHouseholdOwner(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data: household, error: householdError } = await admin.from("households").select("id, name, stripe_customer_id").eq("id", householdId).single();
  if (householdError || !household) return NextResponse.json({ error: "Household not found." }, { status: 404 });

  const { data: member } = await admin.from("members").select("email, display_name").eq("household_id", householdId).eq("user_id", auth.userId).maybeSingle();
  const stripe = getStripeClient();
  let customerId = (household as HouseholdBillingRow).stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: typeof member?.email === "string" ? member.email : undefined,
      name: typeof member?.display_name === "string" ? member.display_name : undefined,
      metadata: { householdId },
    });
    customerId = customer.id;
    await admin.from("households").update({ stripe_customer_id: customerId, subscription_updated_at: new Date().toISOString() }).eq("id", householdId);
  }

  const selectedTier = tier as PaidSubscriptionTier;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: householdId,
    integration_identifier: `${CHECKOUT_INTEGRATION_PREFIX}-${randomBytes(4).toString("hex")}`,
    line_items: [{ price: stripePriceIdForTier(selectedTier), quantity: 1 }],
    metadata: { householdId, tier: selectedTier },
    subscription_data: { metadata: { householdId, tier: selectedTier } },
    success_url: `${appOrigin()}/settings/billing?checkout=success`,
    cancel_url: `${appOrigin()}/settings/billing?checkout=cancelled`,
  });

  if (!session.url) return NextResponse.json({ error: `Couldn't start ${BILLING_PLAN_LABEL[selectedTier]} checkout.` }, { status: 502 });
  return NextResponse.json({ url: session.url });
}
