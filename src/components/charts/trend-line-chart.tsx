"use client";

import { useId } from "react";

export interface TrendPoint {
  label: string;
  value: number;
}

const VIEW_WIDTH = 300;
const VIEW_HEIGHT = 120;
const PADDING_Y = 10;

/**
 * Minimal SVG line/area chart — PRD §35's "Balance-trend chart (line)".
 * No charting library: one line, one fill, a handful of points, values
 * shown as plain text labels rather than interactive tooltips. A real
 * library (recharts et al.) would mostly buy control over interactions
 * this app doesn't need yet, at the cost of fighting its default styling
 * to match the rest of the app's hand-tuned look — not worth it for a
 * chart this simple.
 */
export function TrendLineChart({ points, colorVar = "--color-yellow" }: { points: TrendPoint[]; colorVar?: string }) {
  const gradientId = useId();

  if (points.length === 0) return null;

  const values = points.map((p) => p.value);
  const min = Math.min(...values, 0); // 0 always in range so a below-zero dip is visible against a real baseline
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const usableHeight = VIEW_HEIGHT - PADDING_Y * 2;
  const stepX = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = points.length > 1 ? i * stepX : VIEW_WIDTH / 2;
    const y = PADDING_Y + usableHeight - ((p.value - min) / range) * usableHeight;
    return { x, y };
  });

  const linePath = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${VIEW_WIDTH} ${VIEW_HEIGHT} L 0 ${VIEW_HEIGHT} Z`;
  // Only drawn when the series actually crosses zero — a dashed reference
  // line at a min/max that never leaves positive (or negative) territory
  // would just sit meaninglessly at the very edge of the chart.
  const zeroY = min < 0 && max > 0 ? PADDING_Y + usableHeight - ((0 - min) / range) * usableHeight : null;

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="w-full" style={{ height: 120 }} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={`var(${colorVar})`} stopOpacity="0.25" />
            <stop offset="100%" stopColor={`var(${colorVar})`} stopOpacity="0" />
          </linearGradient>
        </defs>
        {zeroY !== null && <line x1="0" y1={zeroY} x2={VIEW_WIDTH} y2={zeroY} stroke="var(--color-border)" strokeWidth="1" strokeDasharray="3 3" />}
        <path d={areaPath} fill={`url(#${gradientId})`} />
        <path d={linePath} fill="none" stroke={`var(${colorVar})`} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 3 : 0} fill={`var(${colorVar})`} />
        ))}
      </svg>
      <div className="flex justify-between text-micro text-muted-foreground">
        <span>{points[0].label}</span>
        {points.length > 2 && <span>{points[Math.floor(points.length / 2)].label}</span>}
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  );
}
