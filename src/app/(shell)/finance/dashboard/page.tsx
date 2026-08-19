"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { useInventoryStore } from "@/lib/store";
import {
  accountTypeIcon,
  cashFlowForMonth,
  groupAccountsByType,
  netWorth,
  recentTransactions,
  upcomingRecurringBills,
} from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Finance Dashboard (docs/Personal Finance PRD.md §13). Leads with net
 * worth + cash flow, then account balances / recent transactions /
 * upcoming bills below, in that priority order — not an even grid.
 *
 * My Dashboard vs. Household Dashboard toggle (Personal Finance Addendum,
 * "Privacy model", 2026-08-18): My Dashboard is every account the store
 * already gave us (RLS already scoped that to mine + joint + shared-with-
 * me — see the comment on InventoryState.accounts). Household Dashboard
 * filters further, client-side, to joint accounts only (ownerUserId ===
 * null) — it deliberately never aggregates a private balance into the
 * household total, even anonymized, per the Addendum's explicit resolution
 * of that question.
 */
export default function FinanceDashboardPage() {
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const [view, setView] = useState<"mine" | "household">("mine");

  const scopedAccounts = view === "household" ? accounts.filter((a) => a.ownerUserId === null) : accounts;
  const scopedTransactions =
    view === "household"
      ? transactions.filter((t) => scopedAccounts.some((a) => a.id === t.accountId))
      : transactions;

  const worth = netWorth(scopedAccounts);
  const thisMonth = cashFlowForMonth(scopedTransactions, new Date());
  const groups = groupAccountsByType(scopedAccounts);
  const recent = recentTransactions(scopedTransactions, 3);
  const bills = upcomingRecurringBills(recurringBills, 1);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Finance</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Where your household&apos;s money went.</p>
      </div>

      <div className="flex gap-0.5 rounded-lg bg-surface-muted p-0.75">
        <button
          type="button"
          onClick={() => setView("mine")}
          className={cn(
            "flex-1 rounded-md py-2 text-caption font-semibold transition-colors",
            view === "mine" ? "bg-white text-yellow shadow-sm" : "text-muted-foreground"
          )}
        >
          My Dashboard
        </button>
        <button
          type="button"
          onClick={() => setView("household")}
          className={cn(
            "flex-1 rounded-md py-2 text-caption font-semibold transition-colors",
            view === "household" ? "bg-white text-yellow shadow-sm" : "text-muted-foreground"
          )}
        >
          Household
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Net Worth</p>
        <p className="mt-1 text-3xl font-semibold text-ink">{formatCurrency(worth)}</p>
        {/* Trend line needs AccountBalanceSnapshot history (Net Worth Trend screen, not built this pass) — not faked here. */}
        <p className="mt-0.5 text-caption text-muted-foreground">Trend needs a few weeks of history to show.</p>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Cash Flow · This Month</p>
        <div className="mt-2 flex items-center gap-6">
          <div>
            <p className="text-caption text-muted-foreground">Income</p>
            <p className="text-item-title font-semibold text-badge-green-text">{formatCurrency(thisMonth.income, { showPositiveSign: true })}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Spend</p>
            <p className="text-item-title font-semibold text-money-negative-text">{formatCurrency(-thisMonth.spend)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Net</p>
            <p className={cn("text-item-title font-semibold", thisMonth.net >= 0 ? "text-badge-green-text" : "text-money-negative-text")}>
              {formatCurrency(thisMonth.net, { showPositiveSign: true })}
            </p>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Accounts</h2>
          <Link href="/finance/accounts" className="text-caption font-medium text-yellow">
            View all
          </Link>
        </div>
        {groups.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">
            No accounts yet — add one from the Accounts tab.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
            {groups
              .flatMap((g) => g.accounts)
              .slice(0, 3)
              .map((a) => (
                <Link key={a.id} href={`/finance/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3">
                  <IconChip icon={accountTypeIcon(a.type)} tone="muted" size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-body font-medium text-ink">{a.name}</p>
                      {a.ownerUserId !== null && (
                        <Badge className="bg-badge-purple-bg text-badge-purple-text">Personal</Badge>
                      )}
                    </div>
                    <p className="truncate text-caption text-muted-foreground">
                      {a.institutionName}
                      {a.cardLastFour ? ` · ...${a.cardLastFour}` : ""}
                    </p>
                  </div>
                  <span className={cn("shrink-0 text-body font-semibold", a.currentBalance < 0 ? "text-money-negative-text" : "text-ink")}>
                    {formatCurrency(a.currentBalance)}
                  </span>
                </Link>
              ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Recent transactions</h2>
          <Link href="/finance/transactions" className="text-caption font-medium text-yellow">
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
            {recent.map((t) => (
              <Link key={t.id} href={`/finance/transactions?transactionId=${t.id}`} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                  <p className="truncate text-caption text-muted-foreground">{formatShortDate(t.occurredAt)}</p>
                </div>
                <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                  {formatCurrency(t.amount, { showPositiveSign: true })}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Upcoming bills</h2>
          <Link href="/finance/recurring" className="text-caption font-medium text-yellow">
            View all
          </Link>
        </div>
        {bills.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">Nothing due soon.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
            {bills.map((b) => (
              <Link key={b.id} href={`/finance/recurring?billId=${b.id}`} className="flex items-center gap-3 px-4 py-3">
                <IconChip icon="repeat" tone="muted" size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{b.name}</p>
                  <p className="truncate text-caption text-muted-foreground">Due {formatShortDate(b.nextDueDate)}</p>
                </div>
                <span className="shrink-0 text-body font-semibold text-ink">{formatCurrency(b.expectedAmount)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Link
        href="/finance/pending-receipts"
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-3 text-caption font-medium text-muted-foreground"
      >
        <Icon name="receipt" size={16} />
        Pending Receipts
      </Link>

      <Link
        href="/finance"
        className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-white py-3 text-caption font-medium text-muted-foreground"
      >
        <Icon name="grid" size={16} />
        Manage accounts, transactions & more
      </Link>
    </div>
  );
}
