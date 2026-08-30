"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { DonutChart } from "@/components/charts/donut-chart";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ZeroBasedAllocation } from "@/lib/selectors";

// Rank-based teal-shade ramp (largest allocation darkest, smallest
// lightest) — matches the WealthWise mockup's monochrome gradient look
// more closely than the hashed multi-hue badge palette used elsewhere in
// the app (categories here are already sorted by allocation size, so
// "rank" and "visual weight" line up meaningfully, unlike a hash). Built
// from --color-yellow via color-mix() rather than five new global tokens
// — one accent color, five real shades, nothing to keep in sync if the
// brand color ever changes.
const TEAL_SHADE_RAMP = [
  "var(--color-yellow)",
  "color-mix(in srgb, var(--color-yellow) 80%, white)",
  "color-mix(in srgb, var(--color-yellow) 60%, white)",
  "color-mix(in srgb, var(--color-yellow) 40%, white)",
  "color-mix(in srgb, var(--color-yellow) 25%, white)",
];
function shadeForRank(rank: number): string {
  return TEAL_SHADE_RAMP[rank % TEAL_SHADE_RAMP.length];
}

/**
 * Budgeting v2 — Zero-Based Budget Builder: "every dollar of planned
 * income assigned somewhere." targetMonthlyIncome is a stored, user-set
 * figure (Budgeting v2 plan's explicit income-source decision — not
 * derived from real income transactions), edited right here.
 */
export function ZeroBasedBudgetTab({
  allocation,
  onSetTargetIncome,
}: {
  allocation: ZeroBasedAllocation;
  onSetTargetIncome: (amount: number | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(allocation.targetIncome > 0 ? String(allocation.targetIncome) : "");

  function saveIncome() {
    const parsed = Number(draft);
    if (!draft || Number.isNaN(parsed) || parsed < 0) {
      toast.error("Enter a valid income amount.");
      return;
    }
    onSetTargetIncome(parsed === 0 ? null : parsed);
    setEditing(false);
  }

  if (allocation.targetIncome <= 0 && !editing) {
    return (
      <EmptyState
        icon="target"
        title="Set a target monthly income"
        description="Zero-based budgeting works by assigning every dollar of expected income to a category."
        action={
          <Button
            size="sm"
            className="bg-ink-fill text-white hover:bg-ink-fill/90"
            onClick={() => {
              setDraft("");
              setEditing(true);
            }}
          >
            Set income
          </Button>
        }
      />
    );
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <label className="mb-1 block text-caption text-muted-foreground">Target monthly income</label>
        <div className="flex items-center gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="$0.00" className="h-11 flex-1" inputMode="decimal" autoFocus />
          <Button size="sm" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={saveIncome}>
            Save
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const over = allocation.unallocated < 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Target Income</p>
          <button type="button" onClick={() => { setDraft(String(allocation.targetIncome)); setEditing(true); }} className="text-caption font-medium text-yellow-text">
            Edit
          </button>
        </div>
        <div className="mt-3 flex items-center justify-center">
          <DonutChart
            slices={allocation.slices.map((s, i) => ({ key: s.categoryId, value: s.amount, color: shadeForRank(i) }))}
            total={allocation.targetIncome}
            centerLabel={formatCurrency(Math.abs(allocation.unallocated))}
            centerSubLabel={over ? "over-allocated" : "unallocated"}
          />
        </div>
        <p className={cn("mt-3 text-center text-caption", over ? "text-money-negative-text" : "text-muted-foreground")}>
          {over
            ? `Over-allocated by ${formatCurrency(Math.abs(allocation.unallocated))} — budgets add up to more than your target income.`
            : `${formatCurrency(allocation.unallocated)} of ${formatCurrency(allocation.targetIncome)} still unassigned.`}
        </p>
      </div>

      {allocation.slices.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
          {allocation.slices.map((s, i) => (
            <div key={s.categoryId} className="flex items-center gap-3 px-4 py-3">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: shadeForRank(i) }} />
              <span className="min-w-0 flex-1 truncate text-body text-ink">{s.name}</span>
              <span className="shrink-0 text-caption text-muted-foreground">{s.percent}%</span>
              <span className="w-20 shrink-0 text-right text-body font-medium text-ink">{formatCurrency(s.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
