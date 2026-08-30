import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { subscriptionIsActive } from "@/lib/billing";
import { getStripeClient, subscriptionTierForPriceId } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function subscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const value = (subscription as unknown as { current_period_end?: number }).current_period_end;
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  if (!subscription) return null;
  return typeof subscription === "string" ? subscription : subscription.id;
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = getSupabaseAdminClient();
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const paidTier = subscriptionTierForPriceId(priceId);
  const tier = paidTier && subscriptionIsActive(subscription.status) ? paidTier : "free";
  const householdId = typeof subscription.metadata.householdId === "string" ? subscription.metadata.householdId : null;

  const update = {
    subscription_tier: tier,
    subscription_status: subscription.status,
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    subscription_current_period_end: subscriptionPeriodEnd(subscription),
    subscription_updated_at: new Date().toISOString(),
  };

  const query = householdId
    ? admin.from("households").update(update).eq("id", householdId)
    : admin.from("households").update(update).eq("stripe_subscription_id", subscription.id);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

async function markSubscriptionDeleted(subscription: Stripe.Subscription) {
  const admin = getSupabaseAdminClient();
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { error } = await admin
    .from("households")
    .update({
      subscription_tier: "free",
      subscription_status: subscription.status,
      stripe_subscription_id: null,
      stripe_price_id: null,
      subscription_current_period_end: subscriptionPeriodEnd(subscription),
      subscription_updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
  if (error) throw new Error(error.message);
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return NextResponse.json({ error: "Stripe webhook secret is not configured." }, { status: 500 });

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid webhook signature.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await getStripeClient().subscriptions.retrieve(session.subscription);
        await syncSubscription(subscription);
      }
    } else if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      await syncSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await markSubscriptionDeleted(event.data.object as Stripe.Subscription);
    } else if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const subscription = await getStripeClient().subscriptions.retrieve(subscriptionId);
        await syncSubscription(subscription);
      }
    }
  } catch (error) {
    console.error("webhooks/stripe: couldn't sync subscription:", error);
    return NextResponse.json({ error: "Couldn't sync subscription." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
