"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { CategorySpendSuggestion } from "@/lib/selectors";

interface Suggestion {
  categoryId: string;
  suggestedAmount: number;
  reasoning: string;
}

/**
 * Budgeting v2 — "AI Budget Recommendations". Manual trigger, not
 * auto-fetched on page load: a real per-view LLM call shouldn't fire
 * silently every visit to the Budget page. Only shown by the parent page
 * when there's at least one unbudgeted category with real spend history
 * (candidates) — nothing to recommend otherwise.
 */
export function BudgetRecommendationsCard({
  candidates,
  onApply,
}: {
  candidates: CategorySpendSuggestion[];
  onApply: (categoryId: string, amount: number) => void;
}) {
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "loaded">("idle");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  async function fetchRecommendations() {
    setStatus("loading");
    try {
      const res = await fetch("/api/v1/finance/budget-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: candidates.map((c) => ({ categoryId: c.categoryId, name: c.name, trailingAvgSpend: c.trailingAvgSpend, mostRecentMonthSpend: c.mostRecentMonthSpend })),
        }),
      });
      if (!res.ok) throw new Error("request failed");
      const data = (await res.json()) as { suggestions: Suggestion[] };
      setSuggestions(data.suggestions);
      setStatus("loaded");
    } catch {
      setStatus("error");
      toast.error("Couldn't get recommendations. Please try again.");
    }
  }

  const visible = suggestions.filter((s) => !dismissedIds.has(s.categoryId) && !appliedIds.has(s.categoryId));
  const nameById = new Map(candidates.map((c) => [c.categoryId, c.name]));

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon name="ai" size={14} className="text-yellow" />
          <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">AI Budget Recommendations</p>
        </div>
        {status === "idle" && (
          <Button size="sm" variant="outline" onClick={fetchRecommendations}>
            Get Recommendations
          </Button>
        )}
      </div>

      {status === "idle" && (
        <p className="mt-2 text-caption text-muted-foreground">
          {candidates.length} categor{candidates.length === 1 ? "y has" : "ies have"} real spend but no budget yet — get suggested targets based on recent history.
        </p>
      )}

      {status === "loading" && (
        <div className="mt-3 flex items-center justify-center gap-2 py-4 text-caption text-muted-foreground">
          <Icon name="spinner" size={14} className="animate-spin" />
          Thinking about your spending...
        </div>
      )}

      {status === "loaded" && visible.length === 0 && <p className="mt-2 text-caption text-muted-foreground">All caught up.</p>}

      {status === "loaded" && visible.length > 0 && (
        <div className="mt-3 flex flex-col divide-y divide-border">
          {visible.map((s) => (
            <div key={s.categoryId} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <p className="text-body font-medium text-ink">{nameById.get(s.categoryId) ?? "Category"}</p>
                  <p className="text-body font-semibold text-ink">{formatCurrency(s.suggestedAmount)}</p>
                </div>
                <p className="mt-0.5 text-caption text-muted-foreground">{s.reasoning}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="sm"
                  className="bg-ink text-white hover:bg-ink/90"
                  onClick={() => {
                    onApply(s.categoryId, s.suggestedAmount);
                    setAppliedIds((prev) => new Set(prev).add(s.categoryId));
                    toast.success(`Budget set for ${nameById.get(s.categoryId) ?? "category"}`);
                  }}
                >
                  Apply
                </Button>
                <button
                  type="button"
                  onClick={() => setDismissedIds((prev) => new Set(prev).add(s.categoryId))}
                  aria-label="Dismiss"
                  className="tap-target flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
