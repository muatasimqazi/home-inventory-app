"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CashFlowChart } from "@/components/charts/cash-flow-chart";
import { useInventoryStore } from "@/lib/store";
import {
  accountTypeIcon,
  cashFlowForMonth,
  cashFlowTrend,
  categoriesForTransaction,
  categoryBreakdownForMonth,
  groupAccountsByType,
  netWorth,
  recentTransactions,
  sortByLabel,
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
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  // Tag-style multi-category links — same reasoning as Transactions'
  // list page: a transaction can be categorized only via these, with no
  // primary categoryId set, so the Cash Flow category filter below needs
  // this to match everything the category picker/badges elsewhere in the
  // app already treat as "categorized under X".
  const transactionCategoryLinks = useInventoryStore((s) => s.transactionCategories);
  const [view, setView] = useState<"mine" | "household">("mine");
  // First-of-month, not "now" itself — the stepper only ever moves whole
  // months, and pinning to the 1st keeps equality checks (isCurrentMonth
  // below) simple regardless of which day this page happens to load on.
  const [statsMonth, setStatsMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  // "all" (not "" — Radix Select's SelectItem can't take an empty-string
  // value), same convention as Transactions' own category filter. Only
  // narrows the Cash Flow tile, not the category breakdown below it —
  // that chart's entire point is comparing every category at once, so
  // filtering it down to the one category you're already looking at
  // would just collapse it to a single, redundant bar.
  const [cashFlowCategoryId, setCashFlowCategoryId] = useState("all");

  const scopedAccounts = view === "household" ? accounts.filter((a) => a.ownerUserId === null) : accounts;
  const scopedTransactions =
    view === "household"
      ? transactions.filter((t) => scopedAccounts.some((a) => a.id === t.accountId))
      : transactions;

  const categoryIdsByTransaction = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const tc of transactionCategoryLinks) {
      (map[tc.transactionId] ??= []).push(tc.categoryId);
    }
    return map;
  }, [transactionCategoryLinks]);
  const activeFinanceCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const cashFlowSourceTransactions =
    cashFlowCategoryId === "all"
      ? scopedTransactions
      : scopedTransactions.filter((t) =>
          categoriesForTransaction(t, categoryIdsByTransaction[t.id] ?? [], financeCategories).some((c) => c.id === cashFlowCategoryId)
        );

  const now = new Date();
  const isCurrentStatsMonth = statsMonth.getFullYear() === now.getFullYear() && statsMonth.getMonth() === now.getMonth();
  const statsMonthLabel = statsMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  function stepStatsMonth(delta: number) {
    setStatsMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const worth = netWorth(scopedAccounts);
  const monthFlow = cashFlowForMonth(cashFlowSourceTransactions, statsMonth);
  const groups = groupAccountsByType(scopedAccounts);
  const recent = recentTransactions(scopedTransactions, 3);
  const bills = upcomingRecurringBills(recurringBills, 1);
  // cashFlowSourceTransactions, not scopedTransactions — the trend chart
  // needs to actually reflect the category filter too, or picking a
  // category changes the Income/Spend/Net numbers above it while the
  // chart right below keeps showing the whole household's trend, reading
  // as "the filter doesn't do anything." The 6-month *window* itself
  // stays anchored to the real current month regardless of statsMonth
  // (see cashFlowTrend's own default `now` param) — that's "the last 6
  // months up to now," not itself something to browse via the stepper.
  const flowTrend = cashFlowTrend(cashFlowSourceTransactions, 6);
  const categorySpend = categoryBreakdownForMonth(scopedTransactions, financeCategories, statsMonth);
  const maxCategorySpend = Math.max(1, ...categorySpend.map((c) => c.amount));

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
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Cash Flow</p>
          {/* Shared with the category breakdown card below — its own
              header just reflects statsMonthLabel rather than repeating
              this control, since one month applies to both. */}
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => stepStatsMonth(-1)}
              aria-label="Previous month"
              className="tap-target flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted"
            >
              <Icon name="chevronLeft" size={16} />
            </button>
            <span className="w-28 text-center text-caption font-medium text-ink">{statsMonthLabel}</span>
            <button
              type="button"
              onClick={() => stepStatsMonth(1)}
              disabled={isCurrentStatsMonth}
              aria-label="Next month"
              className="tap-target flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
            >
              <Icon name="chevronRight" size={16} />
            </button>
          </div>
        </div>

        {activeFinanceCategories.length > 0 && (
          <div className="mt-2">
            <Select value={cashFlowCategoryId} onValueChange={setCashFlowCategoryId}>
              <SelectTrigger
                className={cn(
                  // Same data-[size=default]:h-auto fix as Transactions'
                  // own category filter chip — see that page's comment for
                  // why a plain h-auto alone doesn't override the base
                  // SelectTrigger's fixed height.
                  "data-[size=default]:h-auto gap-1 rounded-full border px-3 py-1.5 text-caption font-medium",
                  cashFlowCategoryId !== "all" ? "border-ink bg-ink text-white [&_svg]:text-white" : "border-border bg-white text-ink"
                )}
              >
                <SelectValue>{cashFlowCategoryId === "all" ? "All categories" : activeFinanceCategories.find((c) => c.id === cashFlowCategoryId)?.name}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {activeFinanceCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="mt-3 flex items-center gap-6">
          <div>
            <p className="text-caption text-muted-foreground">Income</p>
            <p className="text-item-title font-semibold text-badge-green-text">{formatCurrency(monthFlow.income, { showPositiveSign: true })}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Spend</p>
            <p className="text-item-title font-semibold text-money-negative-text">{formatCurrency(-monthFlow.spend)}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Net</p>
            <p className={cn("text-item-title font-semibold", monthFlow.net >= 0 ? "text-badge-green-text" : "text-money-negative-text")}>
              {formatCurrency(monthFlow.net, { showPositiveSign: true })}
            </p>
          </div>
        </div>
        {/* PRD §35 "Cash flow — income vs. expense, per month" — the tile
            above is a single-period snapshot; this is the actual trend.
            Deliberately still anchored to the real current month
            regardless of statsMonth above — it's "the last 6 months
            leading up to now," not itself something you browse. */}
        <div className="mt-4 border-t border-border pt-4">
          <CashFlowChart months={flowTrend} highlightMonth={statsMonth} />
        </div>
      </div>

      {categorySpend.length > 0 && (
        <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
          <p className="mb-3 text-caption font-medium tracking-wide text-muted-foreground uppercase">Spending by Category · {statsMonthLabel}</p>
          <div className="flex flex-col gap-2.5">
            {categorySpend.map((c) => (
              <div key={c.categoryId ?? "uncategorized"} className="flex items-center gap-3">
                <span className="w-28 shrink-0 truncate text-caption text-ink">{c.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                  <div className="h-full rounded-full bg-yellow" style={{ width: `${Math.max(4, (c.amount / maxCategorySpend) * 100)}%` }} />
                </div>
                <span className="w-20 shrink-0 text-right text-caption font-medium text-ink">{formatCurrency(c.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Accounts</h2>
          <Link href="/finance/accounts" className="text-caption font-medium text-yellow-text">
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
          <Link href="/finance/transactions" className="text-caption font-medium text-yellow-text">
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
                {t.excludedFromReports && (
                  <Icon name="eyeOff" size={14} className="shrink-0 text-muted-foreground" role="img" aria-label="Excluded from reports" />
                )}
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
          <Link href="/finance/recurring" className="text-caption font-medium text-yellow-text">
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
