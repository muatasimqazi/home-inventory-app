import type { CashFlowMonth } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1000) return `$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return formatCurrency(amount);
}

/**
 * Budget vs. Actual trend — WealthWise mockup's centerpiece chart, built
 * the same hand-rolled-SVG way as cash-flow-chart.tsx/trend-line-chart.tsx
 * (no charting library, same stated stance). Two lines: a flat dashed
 * "Budget" reference and a solid "Actual" line. The Budget line is
 * necessarily flat, not zigzagging like the mockup's — this app's budgets
 * are standing per-category targets with no historical per-month record
 * (no "what was the budget in March" to plot), so the *current* total
 * budgeted amount is the only honest figure to show across the window,
 * same as the Budget summary tile right above this chart already does.
 *
 * `highlightMonth` picks out one column to show real numbers for, same
 * idiom as CashFlowChart — real hover tooltips (the mockup's own
 * approach) never show on mobile at all, so this always-visible readout
 * for the selected month is the mobile-first equivalent, driven by the
 * Budget page's own month stepper rather than a separate hover/tap
 * handler here.
 */
export function BudgetVsActualChart({ months, budgetedAmount, highlightMonth }: { months: CashFlowMonth[]; budgetedAmount: number; highlightMonth?: Date }) {
  const maxValue = Math.max(1, budgetedAmount, ...months.map((m) => m.spend));
  const isHighlighted = (m: CashFlowMonth) =>
    !!highlightMonth && m.month.getFullYear() === highlightMonth.getFullYear() && m.month.getMonth() === highlightMonth.getMonth();
  const highlighted = months.find(isHighlighted);

  const width = Math.max(1, months.length - 1) * 100;
  const budgetY = Math.min(96, Math.max(4, 100 - (budgetedAmount / maxValue) * 100));
  const actualPoints = months.map((m, i) => ({ x: i * 100, y: Math.min(96, Math.max(4, 100 - (m.spend / maxValue) * 100)) }));

  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-32">
        <svg className="absolute inset-0 h-32 w-full overflow-visible" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none">
          <line x1="0" y1={budgetY} x2={width} y2={budgetY} stroke="var(--color-yellow)" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
          <polyline
            points={actualPoints.map((p) => `${p.x},${p.y}`).join(" ")}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {actualPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={isHighlighted(months[i]) ? 4 : 0} fill="var(--color-ink)" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      <div className="flex items-stretch justify-between gap-2">
        {months.map((m) => (
          <div key={m.label + m.month.toISOString()} className="flex flex-1 flex-col items-center gap-0.5">
            <span className={cn("text-micro", isHighlighted(m) ? "font-semibold text-ink" : "text-muted-foreground")}>{m.label}</span>
          </div>
        ))}
      </div>

      {highlighted && (
        <div className="flex items-center justify-center gap-4 rounded-lg bg-surface-muted py-2 text-caption">
          <span className="font-medium text-ink">{highlighted.label}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="h-0.5 w-2.5 rounded-full bg-yellow" /> Budget {formatCompact(budgetedAmount)}
          </span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <span className="size-2 rounded-full bg-ink-fill" /> Actual {formatCompact(highlighted.spend)}
          </span>
        </div>
      )}
    </div>
  );
}
