"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BILLING_PLAN_DESCRIPTION, BILLING_PLAN_FEATURES, BILLING_PLAN_LABEL, PAID_SUBSCRIPTION_TIERS, subscriptionIsActive, type PaidSubscriptionTier, type SubscriptionTier } from "@/lib/billing";
import { formatShortDate } from "@/lib/format";
import { useCurrentHousehold, useInventoryStore } from "@/lib/store";
import { appOrigin } from "@/lib/urls";
import { cn } from "@/lib/utils";

export default function BillingSettingsPage() {
  const household = useCurrentHousehold();
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const me = members.find((m) => m.userId === currentUserId);
  const isOwner = me?.role === "owner";
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");
  const [loadingTier, setLoadingTier] = useState<PaidSubscriptionTier | "portal" | null>(null);

  const currentTier = household.subscriptionTier;
  const active = subscriptionIsActive(household.subscriptionStatus);
  const periodEnd = household.subscriptionCurrentPeriodEnd ? formatShortDate(household.subscriptionCurrentPeriodEnd) : null;

  const plans = useMemo(() => ["free", ...PAID_SUBSCRIPTION_TIERS] as SubscriptionTier[], []);
  const isNative = Capacitor.isNativePlatform();

  async function startCheckout(tier: PaidSubscriptionTier) {
    // Google Play policy requires Google Play Billing for a digital
    // subscription purchased and consumed from inside the app — a
    // Stripe Checkout redirect inside the app's own WebView is exactly
    // what that policy targets. Rather than build out real Play Billing
    // (a whole separate entitlement system, plus Google's revenue share)
    // for an initial submission, native just hands off to a real Custom
    // Tab pointed at the website's own upgrade flow — same "escape the
    // WebView for anything payment/OAuth-related" pattern sign-in/page.tsx
    // already uses for Google sign-in. Existing subscribers keep full app
    // access either way; only *starting* a new paid plan moves to the
    // browser. openPortal() below (managing/cancelling an existing
    // subscription) isn't a new purchase, so it's left working natively.
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: `${appOrigin()}/settings/billing` });
      return;
    }

    setLoadingTier(tier);
    try {
      const response = await fetch("/api/v1/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: household.id, tier }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Couldn't start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start checkout.");
      setLoadingTier(null);
    }
  }

  async function openPortal() {
    setLoadingTier("portal");
    try {
      const response = await fetch("/api/v1/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: household.id }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) throw new Error(data.error ?? "Couldn't open billing portal.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't open billing portal.");
      setLoadingTier(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/settings" className="text-caption font-medium text-muted-foreground">
          Settings
        </Link>
        <h1 className="mt-2 text-screen-title font-semibold text-ink">Billing</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Subscription tier for {household.name}.</p>
      </div>

      {checkoutResult === "success" && (
        <div className="rounded-2xl border border-badge-green-border bg-badge-green-bg p-4 text-caption text-badge-green-text">
          Checkout complete. Your plan will update as soon as Stripe sends the confirmation.
        </div>
      )}
      {checkoutResult === "cancelled" && (
        <div className="rounded-2xl border border-border bg-card p-4 text-caption text-muted-foreground shadow-sm">
          Checkout cancelled. Your current plan is unchanged.
        </div>
      )}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-caption text-muted-foreground">Current plan</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-section-title font-semibold text-ink">{BILLING_PLAN_LABEL[currentTier]}</h2>
              {currentTier !== "free" && <Badge className={active ? "bg-badge-green-bg text-badge-green-text" : "bg-badge-orange-bg text-badge-orange-text"}>{household.subscriptionStatus}</Badge>}
            </div>
            {periodEnd && <p className="mt-1 text-caption text-muted-foreground">Current period ends {periodEnd}</p>}
          </div>
          {household.stripeCustomerId && (
            <Button variant="outline" size="sm" onClick={openPortal} disabled={!isOwner || loadingTier !== null}>
              {loadingTier === "portal" ? <Icon name="spinner" size={14} className="animate-spin" /> : <Icon name="creditCard" size={14} />}
              Manage
            </Button>
          )}
        </div>
        {!isOwner && <p className="mt-3 text-caption text-muted-foreground">Only the household owner can change billing.</p>}
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        {plans.map((tier) => {
          const selected = currentTier === tier;
          const paidTier = tier === "plus" || tier === "pro" ? tier : null;
          return (
            <section key={tier} className={cn("flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm", selected ? "border-yellow" : "border-border")}>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-section-title font-semibold text-ink">{BILLING_PLAN_LABEL[tier]}</h2>
                  {selected && <Badge className="bg-brand-100 text-yellow">Current</Badge>}
                </div>
                <p className="mt-2 min-h-10 text-caption text-muted-foreground">{BILLING_PLAN_DESCRIPTION[tier]}</p>
              </div>
              <ul className="flex flex-1 flex-col gap-2">
                {BILLING_PLAN_FEATURES[tier].map((feature) => (
                  <li key={feature} className="flex gap-2 text-caption text-ink">
                    <Icon name="check" size={14} className="mt-0.5 shrink-0 text-yellow" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {paidTier ? (
                <Button className="bg-yellow text-white hover:bg-yellow/90" onClick={() => startCheckout(paidTier)} disabled={!isOwner || selected || loadingTier !== null}>
                  {loadingTier === paidTier ? (
                    <Icon name="spinner" size={16} className="animate-spin" />
                  ) : selected ? (
                    "Current plan"
                  ) : isNative ? (
                    "Continue on schuaz.com"
                  ) : (
                    `Choose ${BILLING_PLAN_LABEL[tier]}`
                  )}
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Included
                </Button>
              )}
            </section>
          );
        })}
      </div>
      {isNative && <p className="text-center text-caption text-muted-foreground">Upgrading opens schuaz.com in your browser — everything else about your plan works the same in the app.</p>}
    </div>
  );
}
