"use client";

export interface DonutSlice {
  key: string;
  value: number;
  colorVar: string;
}

const SIZE = 160;
const STROKE_WIDTH = 20;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Minimal hand-rolled SVG ring chart — no charting library, same stance
 * as trend-line-chart.tsx (see that file's own doc comment). Built for
 * the Zero-Based Budget Builder's income-allocation view: one arc per
 * budgeted category (`stroke-dasharray`/`stroke-dashoffset` segments
 * around a circle, per-slice colored via a CSS var so callers can reuse
 * badgeColorVar() for a category-consistent hue), plus an implicit
 * "unallocated" remainder rendered in a muted color when `slices` don't
 * add up to `total`. `total` is a separate prop rather than the sum of
 * `slices` — Zero-Based needs to show unallocated *income*, which can be
 * more than (or less than, if over-allocated) the slices' own sum.
 */
export function DonutChart({
  slices,
  total,
  centerLabel,
  centerSubLabel,
}: {
  slices: DonutSlice[];
  total: number;
  centerLabel?: string;
  centerSubLabel?: string;
}) {
  const allocated = slices.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  // Over-allocated (allocated > total): draw only the slices, scaled down
  // proportionally so they still tile a single ring instead of overflowing
  // past a full circle — the $ over-allocation itself is called out in
  // the text alongside the chart, not inside the ring geometry.
  const denominator = Math.max(allocated, total, 1);
  const unallocated = Math.max(0, total - allocated);

  // Built with a plain immutable map + prefix sum (not a mutated running
  // `offset` variable) — the number of slices here is always small (one
  // per budgeted category), so the O(n²) prefix sum costs nothing real.
  const positiveSlices = slices.filter((s) => s.value > 0);
  const segments = positiveSlices.map((s, i) => {
    const priorSum = positiveSlices.slice(0, i).reduce((sum, p) => sum + p.value, 0);
    return { ...s, dash: (s.value / denominator) * CIRCUMFERENCE, offset: (priorSum / denominator) * CIRCUMFERENCE };
  });
  const allocatedDash = segments.reduce((sum, s) => sum + s.dash, 0);
  const unallocatedDash = (unallocated / denominator) * CIRCUMFERENCE;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-surface-muted)" strokeWidth={STROKE_WIDTH} />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={`var(${s.colorVar})`}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${s.dash} ${CIRCUMFERENCE - s.dash}`}
            strokeDashoffset={-s.offset}
            strokeLinecap="butt"
          />
        ))}
        {unallocatedDash > 0 && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={`${unallocatedDash} ${CIRCUMFERENCE - unallocatedDash}`}
            strokeDashoffset={-allocatedDash}
            strokeLinecap="butt"
          />
        )}
      </svg>
      {(centerLabel || centerSubLabel) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {centerLabel && <span className="text-item-title font-semibold text-ink">{centerLabel}</span>}
          {centerSubLabel && <span className="text-micro text-muted-foreground">{centerSubLabel}</span>}
        </div>
      )}
    </div>
  );
}
