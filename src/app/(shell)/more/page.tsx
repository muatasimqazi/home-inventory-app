"use client";

import Link from "next/link";
import { Icon } from "@/components/icon";

/**
 * The mobile-only domain switcher — More's entire job is picking which
 * domain to enter (Locations, Finance), nothing else. It used to double as
 * the household Settings page too (profile, members, sign-out, etc.), but
 * that meant Settings had no visible nav tab of its own and this page had
 * two unrelated jobs stacked in one scroll. Split 2026-08-18: Settings is
 * now its own bottom-nav tab at /settings; this page keeps only the
 * domain-switcher cards it started with.
 *
 * Desktop has no equivalent route — its sidebar already shows every domain
 * as a persistent, always-visible section, so it never needed a switcher.
 */
export default function MorePage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">More</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Switch between household domains.</p>
      </div>

      <Link
        href="/locations"
        className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-ink text-white">
          <Icon name="box" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">Locations</p>
          <p className="truncate text-caption text-muted-foreground">Storage areas, containers & items</p>
        </div>
        <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
      </Link>

      <Link
        href="/finance/dashboard"
        className="tap-target flex items-center gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm"
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-[10px] bg-yellow text-white">
          <Icon name="trendingUp" size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-semibold text-ink">Finance</p>
          <p className="truncate text-caption text-muted-foreground">Accounts, transactions, budgets & bills</p>
        </div>
        <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
