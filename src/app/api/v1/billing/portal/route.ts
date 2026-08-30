import { NextResponse } from "next/server";
import Stripe from "stripe";
import { requireHouseholdOwner } from "@/lib/authorize";
import { getStripeClient } from "@/lib/stripe";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { appOrigin } from "@/lib/urls";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { householdId } = (body ?? {}) as { householdId?: unknown };
  if (typeof householdId !== "string" || !householdId) return NextResponse.json({ error: "`householdId` is required." }, { status: 400 });

  const auth = await requireHouseholdOwner(householdId);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdminClient();
  const { data: household, error } = await admin.from("households").select("stripe_customer_id").eq("id", householdId).single();
  if (error || !household?.stripe_customer_id) return NextResponse.json({ error: "No billing customer exists for this household yet." }, { status: 404 });

  // Same "never let a raw Stripe error crash the route" fix as
  // checkout/route.ts's own comment — a stale customer id (from a
  // since-switched test/live key pair, say) needs a real recovery here
  // too, though a different one: there's no fresh customer to silently
  // create and retry with, since Portal has nothing to show for a
  // customer with no billing history. Clears the stale id instead, so
  // settings/billing's own `{household.stripeCustomerId && <Manage>}`
  // check stops offering a Manage button that can only ever fail, and
  // tells the caller plainly instead of crashing.
  try {
    const session = await getStripeClient().billingPortal.sessions.create({
      customer: household.stripe_customer_id as string,
      return_url: `${appOrigin()}/settings/billing`,
    });
    return NextResponse.json({ url: session.url });
  } catch (error) {
    const isStaleCustomer = error instanceof Stripe.errors.StripeInvalidRequestError && error.param === "customer" && error.code === "resource_missing";
    if (isStaleCustomer) {
      await admin.from("households").update({ stripe_customer_id: null, subscription_updated_at: new Date().toISOString() }).eq("id", householdId);
      return NextResponse.json({ error: "That billing account no longer exists — start a new checkout instead." }, { status: 404 });
    }
    console.error("billing/portal: Stripe call failed:", error);
    const message = error instanceof Stripe.errors.StripeError ? error.message : "Couldn't open the billing portal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
