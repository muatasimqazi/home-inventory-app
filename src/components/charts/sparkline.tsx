/**
 * Tiny inline bar sparkline for a summary-card corner — plain divs, same
 * approach as cash-flow-chart.tsx's bar row (no SVG needed for a plain
 * bar chart, no charting library, same house stance as every other chart
 * in this app). Deliberately no axis/labels/tooltip — a sparkline reads
 * as "shape of the trend," not a chart to extract exact values from.
 */
export function Sparkline({ values, colorVar = "--color-yellow" }: { values: number[]; colorVar?: string }) {
  if (values.length === 0) return null;
  // min/max both include 0 (same as trend-line-chart.tsx) so a series
  // that dips negative — Savings Rate in an overspent month, say — still
  // shows real relative height instead of every bar flattening to the
  // floor the way a plain 0-to-max scale would.
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;
  return (
    <div className="flex h-8 items-end gap-0.5">
      {values.map((v, i) => (
        <div
          key={i}
          className="w-1.5 flex-1 rounded-sm"
          style={{ height: `${Math.max(8, ((v - min) / range) * 100)}%`, backgroundColor: `var(${colorVar})`, opacity: i === values.length - 1 ? 1 : 0.35 }}
        />
      ))}
    </div>
  );
}
