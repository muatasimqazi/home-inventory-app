import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { BILLING_PLAN_LABEL, BILLING_PLAN_DESCRIPTION, BILLING_PLAN_FEATURES } from "@/lib/billing";

// Real prices (Stripe, confirmed 2026-09-06: STRIPE_PLUS_PRICE_ID $7.99/mo,
// STRIPE_PRO_PRICE_ID $14.99/mo) — not hardcoded guesses. If these ever
// drift from what Stripe actually charges, that's a real bug to fix here,
// not a cosmetic one.
const PLAN_PRICE_CENTS: Record<"plus" | "pro", number> = { plus: 799, pro: 1499 };

export const metadata: Metadata = {
  title: "Schuaz — Just ask your home.",
  description:
    "Where's the drill? How much did we spend at Costco? Is the TV still under warranty? Schuaz already knows — because it's the one place everything about your household actually lives.",
  openGraph: {
    title: "Schuaz — Just ask your home.",
    description: "One place for your household's belongings, money, wardrobe, notes, and tasks — with AI doing the heavy lifting.",
    type: "website",
  },
};

/**
 * Public marketing landing page — see docs/Landing Page Desing Prompt.md
 * for the full design brief this implements (and the corrections made to
 * it after checking every claim against the real codebase: no meal
 * planning exists, no public pricing page existed before this one, Ask
 * AI's "just ask" capability is real and shipped rather than aspirational,
 * etc.). Every feature claim below is real and currently live — nothing
 * here is aspirational copy for functionality that doesn't exist yet.
 *
 * Reuses this app's own design tokens (sage/neutral palette, card/border/
 * shadow recipe, typography scale) rather than a separate marketing
 * design system — see globals.css's own "v3 sage/neutral system" comment.
 * The hero heading is the one deliberate exception to the in-app type
 * scale (text-display tops out at 30px, too small for a hero) — same
 * clamp()-based escape hatch this page already used before this rewrite.
 */
export default function HomePage() {
  return (
    <main className="min-h-dvh bg-background text-ink">
      <div className="mx-auto flex w-full max-w-6xl flex-col px-6">
        {/* NAV — minimal, per the brief: logo, sign in, one primary CTA.
            pt uses the same env(safe-area-inset-top) convention as every
            authenticated app-shell header (e.g. src/app/add/page.tsx) —
            this page is the one place that was missing it, invisible on
            the web (no OS status bar drawn over a browser tab) until the
            iOS Capacitor wrapper actually put a status bar/Dynamic Island
            on top of it. */}
        <nav className="flex items-center justify-between pb-6 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" width={32} height={32} className="size-8 rounded-lg" />
            <span className="text-body font-semibold">Schuaz</span>
          </Link>
          <div className="flex items-center gap-5">
            <a href="#pricing" className="hidden text-caption font-medium text-muted-foreground hover:text-ink sm:inline">
              Pricing
            </a>
            <Link href="/sign-in" className="text-caption font-medium text-muted-foreground hover:text-ink">
              Sign in
            </Link>
            <Link
              href="/sign-in?action=signup"
              className="tap-target inline-flex h-9 items-center justify-center rounded-xl bg-yellow px-4 text-caption font-medium text-white shadow-sm hover:bg-yellow/90"
            >
              Get Started
            </Link>
          </div>
        </nav>

        {/* HERO */}
        <section className="grid gap-10 py-10 md:grid-cols-2 md:items-center md:py-20">
          <div className="flex flex-col gap-6">
            <p className="w-fit rounded-full bg-brand-100 px-3 py-1 text-caption font-medium text-yellow-text">One place for household life</p>
            <h1 className="text-[clamp(2.25rem,6vw,3.75rem)] leading-[1.02] font-semibold tracking-tight text-ink">Just ask your home.</h1>
            <p className="max-w-lg text-body text-muted-foreground">
              Where&apos;s the drill? How much did we spend at Costco? Is the TV still under warranty? Schuaz already knows — because it&apos;s the one
              place everything about your household actually lives.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/sign-in?action=signup"
                className="tap-target inline-flex h-12 items-center justify-center rounded-2xl bg-yellow px-6 text-body font-medium text-white shadow-sm hover:bg-yellow/90"
              >
                Get Started
              </Link>
              <a
                href="#ask"
                className="tap-target inline-flex h-12 items-center justify-center rounded-2xl border border-border bg-card px-6 text-body font-medium text-ink shadow-sm hover:bg-surface-muted"
              >
                See how it works
              </a>
            </div>
            <p className="text-micro text-muted-foreground">No credit card required to start.</p>
          </div>

          {/* Composition leads with the real Ask interaction (the hero's
              own headline is now "Just ask your home"), with the same
              connected-capability cards as satellite proof underneath —
              not a generic dashboard screenshot. Every card here reflects
              something the product actually does today. */}
          <div className="relative">
            <div className="rounded-3xl border border-border bg-card p-5 shadow-lg">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-100">
                  <Icon name="ai" size={16} className="text-yellow-text" />
                </span>
                <p className="text-caption font-medium text-muted-foreground">Ask</p>
              </div>
              <div className="mt-4 flex justify-end">
                <p className="rounded-2xl rounded-br-sm bg-ink-fill px-4 py-2.5 text-caption text-white">Where&apos;s my drill?</p>
              </div>
              <div className="mt-2 flex items-start gap-2 rounded-2xl rounded-tl-sm bg-brand-100 p-3">
                <Icon name="ai" size={14} className="mt-0.5 shrink-0 text-yellow-text" />
                <p className="text-caption text-ink">Garage → Shelf 2 → Blue Bin.</p>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4">
                <MiniCard icon="cash" label="Spending" value="$2,340" />
                <MiniCard icon="tasks" label="Tasks" value="3 due" />
                <MiniCard icon="sun" label="Weather" value="Bring a jacket" />
              </div>
            </div>
            <div className="absolute -top-6 -right-4 hidden rotate-3 rounded-2xl border border-border bg-card p-3 shadow-lg sm:block">
              <div className="flex items-center gap-2">
                <Icon name="ai" size={14} className="text-yellow-text" />
                <p className="text-caption font-medium text-ink">Is the TV still under warranty?</p>
              </div>
              <p className="mt-1 text-caption text-muted-foreground">Yes — through March 2027.</p>
            </div>
          </div>
        </section>

        {/* THE PROBLEM */}
        <section className="border-t border-border py-14 text-center md:py-20">
          <h2 className="mx-auto max-w-2xl text-section-title font-semibold text-ink md:text-display">
            Your household&apos;s information lives everywhere except one place.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-body text-muted-foreground">
            Belongings in bins and closets. Money in banking apps. Tasks in one app, notes in another. Nobody remembers where everything actually is —
            until you need it.
          </p>
        </section>

        {/* CORE VALUE PROPOSITION — Know / Plan / Understand / Remember */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <ValuePillar icon="box" title="Know" body="What you have, and where it is. Inventory, wardrobe, and who it belongs to." />
            <ValuePillar icon="tasks" title="Plan" body="What to do next — tasks and reminders, plus a real heads-up on the day ahead." />
            <ValuePillar icon="cash" title="Understand" body="Where your household's money actually goes — real accounts, real transactions." />
            <ValuePillar icon="notebook" title="Remember" body="The things that matter but don't fit anywhere else — paint colors, contractor numbers, measurements." />
          </div>
        </section>

        {/* AI INVENTORY DEMONSTRATION */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="flex flex-col gap-4">
              <p className="text-caption font-semibold tracking-wide text-yellow-text uppercase">Home inventory</p>
              <h2 className="text-screen-title font-semibold text-ink md:text-display">Take a photo. We&apos;ll organize what&apos;s inside.</h2>
              <p className="text-body text-muted-foreground">
                Photograph a bin, a shelf, or a closet. AI identifies what&apos;s in the frame and catalogs each item — by room, container, category, and
                household member. It even generates a clean studio-style photo for anything new, so your inventory looks organized, not like a pile of
                snapshots.
              </p>
              <p className="text-body text-muted-foreground">Later, just ask where something is — and get the real answer, not a guess.</p>
            </div>
            <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm">
              <p className="text-caption font-medium text-muted-foreground">Photo of a garage shelf →</p>
              <div className="flex flex-wrap gap-2">
                {["HDMI cable", "USB-C charger", "Batteries", "Power adapter", "Extension cord"].map((item) => (
                  <span key={item} className="rounded-full border border-border bg-surface-muted px-3 py-1 text-caption text-ink">
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 rounded-2xl bg-brand-100 p-3">
                <Icon name="ai" size={16} className="text-yellow-text" />
                <p className="text-caption text-ink">
                  <span className="font-medium">&ldquo;Where are my batteries?&rdquo;</span> — Garage → Shelf 2 → Blue Bin
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* HOUSEHOLD FINANCES */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="order-2 flex flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-sm md:order-1">
              <div className="flex items-center justify-between">
                <p className="text-caption font-medium text-muted-foreground">This month</p>
                <p className="text-section-title font-semibold text-ink">$2,340.12</p>
              </div>
              {[
                ["Groceries", "$612.40"],
                ["Dining out", "$284.90"],
                ["Utilities", "$198.00"],
              ].map(([label, amount]) => (
                <div key={label} className="flex items-center justify-between border-t border-border pt-3 text-caption">
                  <span className="text-ink">{label}</span>
                  <span className="text-muted-foreground">{amount}</span>
                </div>
              ))}
              <div className="mt-1 flex items-center gap-2 rounded-2xl bg-brand-100 p-3">
                <Icon name="ai" size={16} className="text-yellow-text" />
                <p className="text-caption text-ink">
                  <span className="font-medium">&ldquo;How much did I spend at Costco last month?&rdquo;</span> — $760, across two visits.
                </p>
              </div>
            </div>
            <div className="order-1 flex flex-col gap-4 md:order-2">
              <p className="text-caption font-semibold tracking-wide text-yellow-text uppercase">Personal finance</p>
              <h2 className="text-screen-title font-semibold text-ink md:text-display">Understand what it costs to run your household.</h2>
              <p className="text-body text-muted-foreground">
                Connect real bank accounts — transactions import automatically, no manual entry. Photograph a receipt and it&apos;s scanned and itemized
                for you. Every purchase can connect back to the actual thing you bought: a TV links to its receipt, its warranty status, and where it
                lives in your home.
              </p>
            </div>
          </div>
        </section>

        {/* WEATHER & DAILY CONTEXT — kept brief, a supporting proof point */}
        <section className="border-t border-border py-12">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-100">
              <Icon name="sun" size={20} className="text-yellow-text" />
            </span>
            <h2 className="text-section-title font-semibold text-ink">Schuaz already knows where you live.</h2>
            <p className="max-w-md text-caption text-muted-foreground">
              A daily weather summary on your Overview page — and small, useful nudges when it matters: bring an umbrella, bundle up, it&apos;s hot out
              there.
            </p>
          </div>
        </section>

        {/* WARDROBE */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="grid gap-10 md:grid-cols-2 md:items-center">
            <div className="flex flex-col gap-4">
              <p className="text-caption font-semibold tracking-wide text-yellow-text uppercase">Wardrobe</p>
              <h2 className="text-screen-title font-semibold text-ink md:text-display">Your closet, beautifully organized.</h2>
              <p className="text-body text-muted-foreground">
                Clean, studio-style photos of your actual clothing — not a spreadsheet of records. Browse visually, organize by household member, and
                finally see what you already own before buying it again.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {["Jacket", "Sweater", "Boots", "Dress", "Shirt", "Coat"].map((item) => (
                <div key={item} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card shadow-sm">
                  <Icon name="grid" size={22} className="text-muted-foreground" />
                  <span className="text-micro text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* NOTES + TASKS */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="flex flex-col items-center gap-6 text-center">
            <h2 className="text-screen-title font-semibold text-ink md:text-display">Remember what matters. Get things done.</h2>
            <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 text-left shadow-sm">
                <div className="flex items-center gap-2">
                  <Icon name="notebook" size={14} className="text-yellow-text" />
                  <p className="text-caption font-medium text-muted-foreground">Note</p>
                </div>
                <p className="text-body text-ink">Living room paint is Benjamin Moore White Dove.</p>
              </div>
              <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 text-left shadow-sm">
                <div className="flex items-center gap-2">
                  <Icon name="tasks" size={14} className="text-yellow-text" />
                  <p className="text-caption font-medium text-muted-foreground">Task</p>
                </div>
                <p className="text-body text-ink">Replace HVAC filter — due this week</p>
              </div>
            </div>
          </div>
        </section>

        {/* HOUSEHOLD / FAMILY */}
        <section className="border-t border-border py-14 md:py-20">
          <div className="flex flex-col items-center gap-6 text-center">
            <span className="flex size-11 items-center justify-center rounded-full bg-brand-100">
              <Icon name="users" size={20} className="text-yellow-text" />
            </span>
            <h2 className="max-w-lg text-screen-title font-semibold text-ink md:text-display">Built for the whole household — not just one login.</h2>
            <p className="max-w-md text-body text-muted-foreground">
              Invite the people you share a home with. Kids and other family members don&apos;t need their own account — create a managed profile and
              connect belongings, clothing, and tasks to them directly.
            </p>
          </div>
        </section>

        {/* ASK YOUR HOME — the strongest, most real section */}
        <section id="ask" className="scroll-mt-6 border-t border-border py-14 md:py-20">
          <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
            <p className="text-caption font-semibold tracking-wide text-yellow-text uppercase">Ask your home anything</p>
            <h2 className="text-[clamp(1.75rem,4vw,3rem)] leading-tight font-semibold text-ink">Just ask.</h2>
            <p className="max-w-lg text-body text-muted-foreground">
              This isn&apos;t a demo. It&apos;s live, right now, across everything you&apos;ve stored — and you can speak the question and hear the
              answer back, hands-free.
            </p>
          </div>
          <div className="mx-auto mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
            {[
              "Where are the Christmas lights?",
              "How much did we spend eating out last month?",
              "What do I need to do this weekend?",
              "What's the weather, and what should I wear?",
              "Is my mixer still under warranty?",
              "What tasks are due this week?",
            ].map((q) => (
              <div key={q} className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left shadow-sm">
                <Icon name="ai" size={14} className="shrink-0 text-yellow-text" />
                <p className="text-caption text-ink">{q}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING — real Stripe tiers, no invented numbers */}
        <section id="pricing" className="scroll-mt-6 border-t border-border py-14 md:py-20">
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-screen-title font-semibold text-ink md:text-display">Simple pricing, no surprises.</h2>
            <p className="max-w-md text-body text-muted-foreground">Start free. Upgrade whenever your household needs more.</p>
          </div>
          <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-3">
            <PricingCard tier="free" priceLabel="$0" />
            <PricingCard tier="plus" priceLabel={`$${(PLAN_PRICE_CENTS.plus / 100).toFixed(2)}`} highlight />
            <PricingCard tier="pro" priceLabel={`$${(PLAN_PRICE_CENTS.pro / 100).toFixed(2)}`} />
          </div>
        </section>

        {/* FINAL CTA */}
        <section className="border-t border-border py-16 text-center md:py-24">
          <h2 className="mx-auto max-w-xl text-screen-title font-semibold text-ink md:text-display">
            Your home already has a lot to keep track of. You shouldn&apos;t have to remember it all.
          </h2>
          <Link
            href="/sign-in?action=signup"
            className="tap-target mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-yellow px-8 text-body font-medium text-white shadow-sm hover:bg-yellow/90"
          >
            Get Started
          </Link>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border py-6 text-micro text-muted-foreground">
          <span>© {new Date().getFullYear()} Schuaz</span>
          <div className="flex gap-4">
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            <Link href="/terms" className="underline underline-offset-2">
              Terms
            </Link>
            <Link href="/contact" className="underline underline-offset-2">
              Contact
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

function MiniCard({ icon, label, value }: { icon: "box" | "sun" | "cash" | "tasks"; label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-border bg-surface-muted p-3">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} size={13} className="text-yellow-text" />
        <p className="text-micro font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-caption font-medium text-ink">{value}</p>
    </div>
  );
}

function ValuePillar({ icon, title, body }: { icon: "box" | "tasks" | "cash" | "notebook"; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <span className="flex size-10 items-center justify-center rounded-full bg-brand-100">
        <Icon name={icon} size={18} className="text-yellow-text" />
      </span>
      <p className="text-body font-semibold text-ink">{title}</p>
      <p className="text-caption text-muted-foreground">{body}</p>
    </div>
  );
}

function PricingCard({ tier, priceLabel, highlight }: { tier: "free" | "plus" | "pro"; priceLabel: string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm ${highlight ? "border-yellow" : "border-border"}`}>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-section-title font-semibold text-ink">{BILLING_PLAN_LABEL[tier]}</p>
          {highlight && <span className="rounded-full bg-brand-100 px-2 py-0.5 text-micro font-medium text-yellow-text">Most popular</span>}
        </div>
        <p className="mt-1 text-display font-semibold text-ink">
          {priceLabel}
          {tier !== "free" && <span className="text-caption font-normal text-muted-foreground">/mo</span>}
        </p>
        <p className="mt-2 min-h-10 text-caption text-muted-foreground">{BILLING_PLAN_DESCRIPTION[tier]}</p>
      </div>
      <ul className="flex flex-1 flex-col gap-2">
        {BILLING_PLAN_FEATURES[tier].map((feature) => (
          <li key={feature} className="flex gap-2 text-caption text-ink">
            <Icon name="check" size={14} className="mt-0.5 shrink-0 text-yellow-text" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <Link
        href="/sign-in?action=signup"
        className={`tap-target inline-flex h-10 items-center justify-center rounded-xl text-caption font-medium shadow-sm ${
          highlight ? "bg-yellow text-white hover:bg-yellow/90" : "border border-border bg-card text-ink hover:bg-surface-muted"
        }`}
      >
        {tier === "free" ? "Get Started" : `Choose ${BILLING_PLAN_LABEL[tier]}`}
      </Link>
    </div>
  );
}
