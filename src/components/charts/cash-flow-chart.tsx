import type { CashFlowMonth } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Short form for a bar-top label — "$1.2k" not "$1,234.00"; the full amount is still in the hover title for anyone who wants it exactly. */
function formatCompact(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1000) return `${amount < 0 ? "-" : ""}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return formatCurrency(amount);
}

/**
 * Grouped bar chart — PRD §35's "Cash flow — income vs. expense, per
 * month" chart. Plain CSS bars (height as a percentage of the row's own
 * fixed pixel height), not SVG — a bar chart's geometry is simple enough
 * that div-based bars stay legible and match the rest of this app's
 * mostly-div visual language (e.g. Net Worth's original bar-per-date
 * rows) better than reaching for SVG or a library for this one case.
 * Exception: the net-per-month line connecting each column's midpoint is
 * a real <svg><polyline>, since a CSS-only diagonal connector between
 * arbitrary points isn't practical — everything else here stays div-based.
 *
 * `highlightMonth`, when given, is compared against each point's own
 * `month` (both first-of-month Dates) to pick out one column — the
 * Finance Dashboard passes its month-stepper's current selection so the
 * 6-month trend visually anchors to whichever month the Cash Flow tile
 * above it is showing, instead of reading as a disconnected chart next
 * to a filterable one.
 */
export function CashFlowChart({ months, highlightMonth }: { months: CashFlowMonth[]; highlightMonth?: Date }) {
  const maxValue = Math.max(1, ...months.flatMap((m) => [m.income, m.spend]));
  const isHighlighted = (m: CashFlowMonth) =>
    !!highlightMonth && m.month.getFullYear() === highlightMonth.getFullYear() && m.month.getMonth() === highlightMonth.getMonth();

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        {/* Net trend line — an SVG overlay in the same coordinate space as
            the bar row below it (0-100 viewBox on both axes), positioned
            absolutely on top. Drawn first/underneath so the bars visually
            read as the primary data and the line as a secondary overlay,
            matching the legend order below. */}
        <svg
          className="pointer-events-none absolute inset-0 h-32 w-full overflow-visible"
          viewBox={`0 0 ${Math.max(1, months.length - 1) * 100} 100`}
          preserveAspectRatio="none"
        >
          <polyline
            points={months
              .map((m, i) => {
                // Net can run negative — same maxValue scale as the bars,
                // but centered on a 50-mid baseline so a negative net
                // still plots on-chart instead of clipping off the
                // bottom edge.
                const y = 50 - (m.net / maxValue) * 50;
                return `${i * 100},${Math.min(96, Math.max(4, y))}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--color-yellow)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* items-stretch (the default, but stated explicitly since it's
            load-bearing here) so each month column actually receives the
            full h-32 — the bar row below needs a *real* pixel height for
            its children's height:X% to resolve against; items-end here
            would collapse each column to its own content size instead,
            and every percentage-height bar silently renders at 0. */}
        <div className="relative flex h-32 items-stretch justify-between gap-2">
          {months.map((m) => {
            const highlighted = isHighlighted(m);
            return (
              <div
                key={m.label + m.month.toISOString()}
                className={cn("flex flex-1 flex-col items-center justify-end gap-1 rounded-lg pt-4 transition-colors", highlighted && "bg-surface-muted")}
              >
                <div className="flex w-full flex-1 items-end justify-center gap-1.5">
                  <div
                    className="w-full max-w-4 rounded-t-md bg-linear-to-t from-badge-green-text to-badge-green-text/70"
                    style={{ height: `${Math.max(3, (m.income / maxValue) * 100)}%` }}
                    title={`Income: ${formatCurrency(m.income)}`}
                  />
                  <div
                    className="w-full max-w-4 rounded-t-md bg-linear-to-t from-money-negative-text to-money-negative-text/70"
                    style={{ height: `${Math.max(3, (m.spend / maxValue) * 100)}%` }}
                    title={`Spend: ${formatCurrency(m.spend)}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-stretch justify-between gap-2">
        {months.map((m) => {
          const highlighted = isHighlighted(m);
          return (
            <div key={m.label + m.month.toISOString()} className="flex flex-1 flex-col items-center gap-0.5">
              {/* Always-visible, not hover-only — the old title-attribute
                  tooltips this replaced never showed on mobile at all
                  (no hover state to trigger them), so the chart carried
                  no readable values outside a mouse. Only the highlighted
                  column gets numbers by default to keep 6 columns from
                  overflowing a narrow phone width; every column still
                  has real hover tooltips on the bars themselves for
                  anyone on desktop who wants another month's numbers. */}
              {highlighted && (
                <span className="text-micro leading-tight font-semibold text-ink" title={`Net: ${formatCurrency(m.net)}`}>
                  {formatCompact(m.net)}
                </span>
              )}
              <span className={cn("text-micro", highlighted ? "font-semibold text-ink" : "text-muted-foreground")}>{m.label}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-center gap-4 text-micro text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-badge-green-text" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-full bg-money-negative-text" /> Spend
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-2.5 rounded-full bg-yellow" /> Net
        </span>
      </div>
    </div>
  );
}
