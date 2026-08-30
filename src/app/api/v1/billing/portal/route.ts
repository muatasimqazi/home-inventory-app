import { NextResponse } from "next/server";
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

  const session = await getStripeClient().billingPortal.sessions.create({
    customer: household.stripe_customer_id as string,
    return_url: `${appOrigin()}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
