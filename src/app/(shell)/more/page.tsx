"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { INVENTORY_LINKS, FINANCE_LINKS, type NavLink } from "@/lib/nav-links";
import { useCurrentHousehold } from "@/lib/store";

/**
 * The mobile-only domain switcher. Used to be just the two big cards below
 * — nothing else — which quietly meant several real pages (Favorites,
 * Manage, Categories & Rules, Net Worth) were reachable from
 * DesktopSidebar only, with zero path to them on mobile short of typing
 * the URL (reported: "mobile view doesn't expose all functionality via
 * nav"). Now lists each domain's sub-pages below its card too, sourced
 * from the same lib/nav-links.ts arrays DesktopSidebar renders — add a
 * page there once and it shows up on both surfaces, so this can't drift
 * out of sync with desktop again.
 *
 * Deliberately does NOT repeat Activity/Trash/Import CSV/Search/Tags/
 * Review/Label Printing here — those already have exactly one reachable
 * path on mobile (Search is a bottom-nav tab; the rest live on /settings)
 * and listing them a second way here would just be the same kind of
 * duplication the desktop sidebar's own Shared section was built to
 * avoid, not a fix for anything.
 *
 * Desktop has no equivalent route — its sidebar already shows every
 * domain as a persistent, always-visible section, so it never needed a
 * switcher.
 */
export default function MorePage() {
  // Household-setup's domain choice (0033_household_domains.sql) — a
  // household that opted out of a domain gets no switcher card or
  // sub-page list for it at all.
  const household = useCurrentHousehold();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">More</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Switch between household domains.</p>
      </div>

      {household.inventoryEnabled && (
        <div className="flex flex-col gap-2">
          <DomainCard href="/locations" icon="box" tone="bg-ink-fill" title="Locations" description="Storage areas, containers & items" />
          <LinkList links={INVENTORY_LINKS} />
        </div>
      )}

      {household.financeEnabled && (
        <div className="flex flex-col gap-2">
          <DomainCard href="/finance/dashboard" icon="trendingUp" tone="bg-yellow" title="Finance" description="Accounts, transactions, budgets & bills" />
          <LinkList links={FINANCE_LINKS} />
        </div>
      )}

      {/* Notes (0050_notes.sql) — always on, no household.xEnabled gate,
          no sub-page list (it's a single list+detail page, not a domain
          with its own sub-nav the way Inventory/Finance are). */}
      <DomainCard href="/notes" icon="notebook" tone="bg-ink-fill" title="Notes" description="Personal & shared notes" />
    </div>
  );
}

function DomainCard({ href, icon, tone, title, description }: { href: string; icon: IconName; tone: string; title: string; description: string }) {
  return (
    <Link href={href} className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <span className={`flex size-12 shrink-0 items-center justify-center rounded-[10px] ${tone} text-white`}>
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{description}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

function LinkList({ links }: { links: NavLink[] }) {
  return (
    <div className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className="tap-target flex items-center gap-3 px-4 py-3">
          <Icon name={link.icon} size={18} className="shrink-0 text-muted-foreground" />
          <span className="flex-1 text-body text-ink">{link.label}</span>
          <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
        </Link>
      ))}
    </div>
  );
}
