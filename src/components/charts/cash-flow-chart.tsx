import type { CashFlowMonth } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";

/**
 * Grouped bar chart — PRD §35's "Cash flow — income vs. expense, per
 * month" chart. Plain CSS bars (height as a percentage of the row's own
 * fixed pixel height), not SVG — a bar chart's geometry is simple enough
 * that div-based bars stay legible and match the rest of this app's
 * mostly-div visual language (e.g. Net Worth's original bar-per-date
 * rows) better than reaching for SVG or a library for this one case.
 */
export function CashFlowChart({ months }: { months: CashFlowMonth[] }) {
  const maxValue = Math.max(1, ...months.flatMap((m) => [m.income, m.spend]));

  return (
    <div className="flex flex-col gap-2">
      {/* items-stretch (the default, but stated explicitly since it's load-
          bearing here) so each month column actually receives the full
          h-32 — the bar row below needs a *real* pixel height for its
          children's height:X% to resolve against; items-end here would
          collapse each column to its own content size instead, and every
          percentage-height bar silently renders at 0. The bar row itself
          is flex-1 (not h-full) so it shares the column's height with the
          label sibling below it rather than overflowing past it. */}
      <div className="flex h-32 items-stretch justify-between gap-2">
        {months.map((m) => (
          <div key={m.label + m.month.toISOString()} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full flex-1 items-end justify-center gap-1">
              <div
                className="w-full max-w-3 rounded-t-sm bg-badge-green-text"
                style={{ height: `${Math.max(2, (m.income / maxValue) * 100)}%` }}
                title={`Income: ${formatCurrency(m.income)}`}
              />
              <div
                className="w-full max-w-3 rounded-t-sm bg-money-negative-text"
                style={{ height: `${Math.max(2, (m.spend / maxValue) * 100)}%` }}
                title={`Spend: ${formatCurrency(m.spend)}`}
              />
            </div>
            <span className="text-micro text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 text-micro text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-badge-green-text" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-money-negative-text" /> Spend
        </span>
      </div>
    </div>
  );
}
