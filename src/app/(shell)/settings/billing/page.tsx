"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Browser } from "@capacitor/browser";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BILLING_PLAN_DESCRIPTION, BILLING_PLAN_FEATURES, BILLING_PLAN_LABEL, PAID_SUBSCRIPTION_TIERS, subscriptionIsActive, type PaidSubscriptionTier, type SubscriptionTier } from "@/lib/billing";
import { formatShortDate } from "@/lib/format";
import { hapticError, hapticSuccess } from "@/lib/haptics";
import { purchaseTier, restorePurchases } from "@/lib/revenuecat-client";
import { useCurrentHousehold, useInventoryStore } from "@/lib/store";
import { appOrigin } from "@/lib/urls";
import { cn } from "@/lib/utils";

/** Household row's subscription_tier lags a real purchase by however
 * long RevenueCat's webhook takes to fire and this route's own DB write
 * to land — usually a couple seconds, not instant. Polls
 * refreshHouseholdBilling short-interval rather than making the user
 * force-quit/reopen the app (or wait for the next unrelated re-render)
 * to see their new plan reflected. Gives up after this many attempts —
 * the purchase itself already succeeded by then, this is purely "how
 * fast does the UI catch up," so a timeout just falls back to a wording
 * that sets the right expectation instead of erroring. */
const BILLING_REFRESH_ATTEMPTS = 10;
const BILLING_REFRESH_INTERVAL_MS = 1500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function BillingSettingsPage() {
  const household = useCurrentHousehold();
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const refreshHouseholdBilling = useInventoryStore((s) => s.refreshHouseholdBilling);
  const me = members.find((m) => m.userId === currentUserId);
  const isOwner = me?.role === "owner";
  const searchParams = useSearchParams();
  const checkoutResult = searchParams.get("checkout");
  const [loadingTier, setLoadingTier] = useState<PaidSubscriptionTier | "portal" | "restore" | null>(null);

  const currentTier = household.subscriptionTier;
  const active = subscriptionIsActive(household.subscriptionStatus);
  // One subscription per household — see billing/checkout/route.ts's own
  // comment. Picking another plan while one is active is a switch.
  const hasPaidPlan = currentTier !== "free" && active;
  const periodEnd = household.subscriptionCurrentPeriodEnd ? formatShortDate(household.subscriptionCurrentPeriodEnd) : null;

  const plans = useMemo(() => ["free", ...PAID_SUBSCRIPTION_TIERS] as SubscriptionTier[], []);
  const isNative = Capacitor.isNativePlatform();
  const isIOS = Capacitor.getPlatform() === "ios";

  // Defense-in-depth alongside NativeRevenueCatInit's CustomerInfo
  // listener: confirmed live that the households row updates correctly
  // (the webhook path works) but the app kept showing a stale plan —
  // the only refresh that used to happen was startCheckout()'s own
  // post-purchase poll below, which never runs for a transaction that
  // reached RevenueCat any other way (a sandbox purchase made outside
  // this exact button, App Review's own testing, a renewal while the
  // app wasn't open). Refreshing on every visit to this page means
  // "did I actually get what I paid for" never depends on how the
  // purchase happened to go through.
  useEffect(() => {
    refreshHouseholdBilling(household.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [household.id]);

  /** Polls until the household row reflects `tier` (or gives up) — see
   * this file's own top-of-file comment for why a purchase's server-side
   * confirmation isn't instant. */
  async function waitForTierUpdate(tier: PaidSubscriptionTier) {
    for (let attempt = 0; attempt < BILLING_REFRESH_ATTEMPTS; attempt++) {
      await refreshHouseholdBilling(household.id);
      if (useInventoryStore.getState().households.find((h) => h.id === household.id)?.subscriptionTier === tier) return true;
      await delay(BILLING_REFRESH_INTERVAL_MS);
    }
    return false;
  }

  async function startCheckout(tier: PaidSubscriptionTier) {
    // iOS: a real StoreKit purchase via RevenueCat (Apple Guideline
    // 3.1.1 — a Stripe Checkout redirect, even via an external browser,
    // isn't allowed here for a digital subscription unlocked in-app).
    // Android keeps the external-browser handoff below for now: Google
    // Play's equivalent policy hasn't blocked a submission yet, and
    // building out Play Billing too is separate scope from the App
    // Store rejection this was written to fix.
    if (isIOS) {
      // Apple can only replace a plan it's billing itself (Plus and Pro
      // share one App Store subscription group) — buying through StoreKit
      // on top of a Stripe subscription would double-bill.
      if (hasPaidPlan && household.billingProvider === "stripe") {
        hapticError();
        toast.error("Your plan is billed on schuaz.com — switch plans there instead.");
        return;
      }
      setLoadingTier(tier);
      const result = await purchaseTier(tier);
      if (!result.ok) {
        setLoadingTier(null);
        if (result.cancelled) return; // backed out of the native sheet — not an error
        hapticError();
        toast.error(result.error ?? `Couldn't start ${BILLING_PLAN_LABEL[tier]} checkout.`);
        return;
      }
      const updated = await waitForTierUpdate(tier);
      setLoadingTier(null);
      if (updated) {
        hapticSuccess();
        toast.success(`You're on ${BILLING_PLAN_LABEL[tier]} now.`);
      } else {
        toast.success("Purchase complete — your plan will update in a moment.");
      }
      return;
    }

    // Same Google Play policy reasoning as this function's iOS branch
    // above, but Android doesn't have a real Play Billing integration
    // yet — native just hands off to a real Custom Tab pointed at the
    // website's own upgrade flow, same "escape the WebView for anything
    // payment/OAuth-related" pattern sign-in/page.tsx already uses for
    // Google sign-in. Existing subscribers keep full app access either
    // way; only *starting* a new paid plan moves to the browser.
    // openPortal() below (managing/cancelling an existing subscription)
    // isn't a new purchase, so it's left working natively.
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
      const data = (await response.json()) as { url?: string; switched?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Couldn't start checkout.");
      // Existing Stripe subscription switched in place — no Checkout
      // redirect, the change is already made; just wait for the webhook.
      if (data.switched) {
        const updated = await waitForTierUpdate(tier);
        setLoadingTier(null);
        toast.success(updated ? `You're on ${BILLING_PLAN_LABEL[tier]} now.` : "Plan switched — it'll update here in a moment.");
        return;
      }
      if (!data.url) throw new Error("Couldn't start checkout.");
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't start checkout.");
      setLoadingTier(null);
    }
  }

  /** Apple requires a visible way to restore a previous purchase (a
   * reinstall, a new device) without paying again — StoreKit itself has
   * no separate "restore" UI of its own, apps have to provide one. */
  async function handleRestorePurchases() {
    setLoadingTier("restore");
    const result = await restorePurchases();
    if (!result.ok) {
      setLoadingTier(null);
      hapticError();
      toast.error(result.error ?? "Couldn't restore purchases.");
      return;
    }
    await refreshHouseholdBilling(household.id);
    setLoadingTier(null);
    hapticSuccess();
    toast.success("Purchases restored.");
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
              {currentTier !== "free" &&
                (household.subscriptionCancelAtPeriodEnd ? (
                  <Badge className="bg-badge-orange-bg text-badge-orange-text">Cancels {periodEnd}</Badge>
                ) : (
                  <Badge className={active ? "bg-badge-green-bg text-badge-green-text" : "bg-badge-orange-bg text-badge-orange-text"}>{household.subscriptionStatus}</Badge>
                ))}
            </div>
            {periodEnd &&
              (household.subscriptionCancelAtPeriodEnd ? (
                <p className="mt-1 text-caption text-muted-foreground">You&apos;ll keep {BILLING_PLAN_LABEL[currentTier]} until {periodEnd}, then drop to Free.</p>
              ) : (
                <p className="mt-1 text-caption text-muted-foreground">Current period ends {periodEnd}</p>
              ))}
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
                  ) : isNative && !isIOS ? (
                    "Continue on schuaz.com"
                  ) : (
                    `${hasPaidPlan ? "Switch to" : "Choose"} ${BILLING_PLAN_LABEL[tier]}`
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
      {isIOS && (
        <div className="flex flex-col items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRestorePurchases} disabled={loadingTier !== null}>
            {loadingTier === "restore" ? <Icon name="spinner" size={14} className="animate-spin" /> : <Icon name="restore" size={14} />}
            Restore purchases
          </Button>
          <p className="text-center text-micro text-muted-foreground">Reinstalled the app, or switched devices? This brings back a plan you already paid for — no new charge.</p>
        </div>
      )}
      {isNative && !isIOS && (
        <p className="text-center text-caption text-muted-foreground">Upgrading opens schuaz.com in your browser — everything else about your plan works the same in the app.</p>
      )}
    </div>
  );
}
