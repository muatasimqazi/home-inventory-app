"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

/**
 * Bare `/finance` — a menu of every Finance section. Stand-in for the real
 * Finance-internal nav bar (Dashboard/Transactions/Accounts/Manage, per
 * docs/Personal Finance PRD.md §35) until Phase 4 wires that into the
 * shell for real; until then this is how every screen built this pass is
 * actually reachable in one place instead of only by memorized URLs.
 */
const SECTIONS: { href: string; icon: IconName; label: string; description: string }[] = [
  { href: "/finance/dashboard", icon: "trendingUp", label: "Dashboard", description: "Net worth, cash flow, what needs attention" },
  { href: "/finance/scan", icon: "camera", label: "Scan Receipt", description: "Photograph a receipt to auto-fill a transaction" },
  { href: "/finance/transactions", icon: "receipt", label: "Transactions", description: "Every transaction across your accounts" },
  { href: "/finance/accounts", icon: "wallet", label: "Accounts", description: "Checking, savings, cards, loans & investments" },
  { href: "/finance/categories", icon: "pieChart", label: "Categories & Rules", description: "Organize spending, automate categorization" },
  { href: "/finance/recurring", icon: "repeat", label: "Recurring Bills", description: "Mortgage, subscriptions, and other regular bills" },
  { href: "/finance/net-worth", icon: "trendingUp", label: "Net Worth", description: "Trend over time" },
  { href: "/finance/import", icon: "upload", label: "Import from CSV", description: "Bring in transactions from a bank export" },
  { href: "/activity?domain=finance", icon: "activity", label: "Activity", description: "Who did what, and when" },
  { href: "/trash?tab=finance", icon: "trash", label: "Trash", description: "Restore or permanently delete" },
];

export default function FinanceIndexPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Finance</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Household finances, all in one place.</p>
      </div>
      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted text-ink">
              <Icon name={s.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body font-medium text-ink">{s.label}</p>
              <p className="truncate text-caption text-muted-foreground">{s.description}</p>
            </div>
            <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
