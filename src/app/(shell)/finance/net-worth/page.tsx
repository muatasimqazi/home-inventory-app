"use client";

import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { TrendLineChart } from "@/components/charts/trend-line-chart";
import { useInventoryStore } from "@/lib/store";
import { activeAccounts, netWorth } from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Net Worth Trend (docs/Personal Finance PRD.md §35 — "Balance-trend
 * chart (line)"). Real trend data needs AccountBalanceSnapshot history,
 * normally populated by a nightly scheduled job (PRD §30) this pass
 * doesn't set up (pg_cron, deferred). "Record snapshot" lets a household
 * start building real history today instead of showing a fake chart or
 * staying permanently empty. The line chart itself was a later addition
 * (Figma audit found the PRD asks for "line," the original build shipped
 * a horizontal-bar-per-date list instead) — real snapshot data, just a
 * different visualization; the per-date list stays underneath as detail.
 */
export default function NetWorthTrendPage() {
  const accounts = useInventoryStore((s) => s.accounts);
  const snapshots = useInventoryStore((s) => s.accountBalanceSnapshots);
  const recordNetWorthSnapshot = useInventoryStore((s) => s.recordNetWorthSnapshot);

  const active = activeAccounts(accounts);
  const worth = netWorth(active);
  const assets = active.filter((a) => a.currentBalance >= 0).reduce((sum, a) => sum + a.currentBalance, 0);
  const liabilities = active.filter((a) => a.currentBalance < 0).reduce((sum, a) => sum + Math.abs(a.currentBalance), 0);

  // Net worth per day = sum of that day's per-account snapshots — a
  // snapshot batch only ever covers accounts that existed at the time,
  // so this doesn't need every account to have a row on every date.
  const byDate = new Map<string, number>();
  for (const snap of snapshots) {
    byDate.set(snap.asOfDate, (byDate.get(snap.asOfDate) ?? 0) + snap.balance);
  }
  const trend = Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  const maxAbs = Math.max(1, ...trend.map(([, v]) => Math.abs(v)));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <BackButton hideOnDesktop />
          <div>
            <h1 className="text-screen-title font-semibold text-ink">Net Worth</h1>
            <p className="mt-0.5 text-caption text-muted-foreground">Trend over time.</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            recordNetWorthSnapshot();
            toast.success("Snapshot recorded");
          }}
          disabled={active.length === 0}
        >
          <Icon name="trendingUp" size={14} /> Record snapshot
        </Button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Current Net Worth</p>
        <p className="mt-1 text-display font-semibold text-ink">{formatCurrency(worth)}</p>
      </div>

      <div>
        <h2 className="mb-2 text-item-title font-semibold text-ink">Trend</h2>
        {trend.length === 0 ? (
          <EmptyState
            icon="trendingUp"
            title="No history yet"
            description="Record a snapshot to start tracking net worth over time. This normally happens automatically each night."
          />
        ) : (
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-4 shadow-sm">
            <TrendLineChart points={trend.map(([date, value]) => ({ label: formatShortDate(new Date(date).toISOString()), value }))} />
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              {trend.map(([date, value]) => (
                <div key={date} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-caption text-muted-foreground">{formatShortDate(new Date(date).toISOString())}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className={cn("h-full rounded-full", value < 0 ? "bg-money-negative-text" : "bg-yellow")}
                      style={{ width: `${Math.max(4, (Math.abs(value) / maxAbs) * 100)}%` }}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-right text-caption font-medium text-ink">{formatCurrency(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 text-item-title font-semibold text-ink">Assets vs. Liabilities</h2>
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-body text-ink">Assets</span>
            <span className="text-body font-semibold text-badge-green-text">{formatCurrency(assets)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-body text-ink">Liabilities</span>
            <span className="text-body font-semibold text-money-negative-text">{formatCurrency(-liabilities)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
