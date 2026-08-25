"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryBudgetFormDialog } from "@/components/category-budget-form-dialog";
import { BudgetRecommendationsCard } from "@/components/budget-recommendations-card";
import { ZeroBasedBudgetTab } from "@/components/zero-based-budget-tab";
import { BudgetVsActualChart } from "@/components/charts/budget-vs-actual-chart";
import { useInventoryStore } from "@/lib/store";
import { budgetVsActualForMonth, cashFlowForMonth, cashFlowTrend, sortByLabel, trailingCategorySpend, spendingInsights, zeroBasedAllocation } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRemountKey } from "@/hooks/use-remount-key";

/**
 * Budgeting v1 (per-category budget vs. actual) + v2 (docs note: v1
 * deliberately deferred AI Budget Recommendations, the Zero-Based Budget
 * Builder, and dynamic insight cards — v2 builds all three back in, per
 * explicit user request, as extensions of this same page rather than
 * Dashboard clutter). Two tabs: "By Category" (v1's budget-vs-actual,
 * now also hosting Recommendations + insight callouts) and "Zero-Based"
 * (v2's income-allocation view).
 */
export default function BudgetPage() {
  const transactions = useInventoryStore((s) => s.transactions);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const transactionCategoryLinks = useInventoryStore((s) => s.transactionCategories);
  const categoryBudgets = useInventoryStore((s) => s.categoryBudgets);
  const setCategoryBudget = useInventoryStore((s) => s.setCategoryBudget);
  const deleteCategoryBudget = useInventoryStore((s) => s.deleteCategoryBudget);
  const financeSettings = useInventoryStore((s) => s.financeSettings);
  const setTargetMonthlyIncome = useInventoryStore((s) => s.setTargetMonthlyIncome);

  const [tab, setTab] = useState("category");

  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const now = new Date();
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  function stepMonth(delta: number) {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  }

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, bumpDialogKey] = useRemountKey();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);

  const activeCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const unbudgetedCategories = activeCategories.filter((c) => !categoryBudgets.some((b) => b.categoryId === c.id));

  const progress = useMemo(
    () => budgetVsActualForMonth(transactions, categoryBudgets, transactionCategoryLinks, financeCategories, month),
    [transactions, categoryBudgets, transactionCategoryLinks, financeCategories, month]
  );
  const totalBudgeted = categoryBudgets.reduce((sum, b) => sum + b.monthlyAmount, 0);
  // Whole household's real spend, not just the budgeted categories' sum —
  // overspending in a category with no budget set shouldn't be silently
  // invisible from the top-line Actual Spending figure.
  const totalActual = cashFlowForMonth(transactions, month).spend;
  const totalRemaining = totalBudgeted - totalActual;
  // 6-month window anchored to real "now", not the stepper's `month" —
  // same reasoning as the Dashboard's own cash-flow trend chart: it's
  // "the last 6 months up to now," not itself something to browse. If
  // the stepper is walked back further than that, the highlighted column
  // simply falls outside this chart's window, same known limitation the
  // Dashboard's trend chart already has.
  const spendTrend = useMemo(() => cashFlowTrend(transactions, 6), [transactions]);

  const recommendationCandidates = useMemo(
    () => trailingCategorySpend(transactions, transactionCategoryLinks, financeCategories, categoryBudgets),
    [transactions, transactionCategoryLinks, financeCategories, categoryBudgets]
  );
  const insights = useMemo(
    () => spendingInsights(transactions, transactionCategoryLinks, financeCategories, month),
    [transactions, transactionCategoryLinks, financeCategories, month]
  );
  const allocation = useMemo(
    () => zeroBasedAllocation(categoryBudgets, financeCategories, financeSettings?.targetMonthlyIncome ?? null),
    [categoryBudgets, financeCategories, financeSettings]
  );

  const editingBudget = editingCategoryId ? categoryBudgets.find((b) => b.categoryId === editingCategoryId) : null;
  const editingCategory = editingCategoryId ? financeCategories.find((c) => c.id === editingCategoryId) : null;

  function openAdd() {
    setEditingCategoryId(null);
    bumpDialogKey();
    setDialogOpen(true);
  }
  function openEdit(categoryId: string) {
    setEditingCategoryId(categoryId);
    bumpDialogKey();
    setDialogOpen(true);
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-5">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Budget</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Set monthly targets and track spend against them.</p>
      </div>

      <TabsList>
        <TabsTrigger value="category">By Category</TabsTrigger>
        <TabsTrigger value="zero-based">Zero-Based</TabsTrigger>
      </TabsList>

      <TabsContent value="category" className="flex flex-col gap-5">
        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            aria-label="Previous month"
            className="tap-target flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <span className="w-32 text-center text-caption font-medium text-ink">{monthLabel}</span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            disabled={isCurrentMonth}
            aria-label="Next month"
            className="tap-target flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted disabled:opacity-30"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        {insights.length > 0 && (
          <div className="flex flex-col gap-2">
            {insights.map((insight) => (
              <div
                key={insight.categoryId}
                className={cn(
                  "flex items-start gap-2.5 rounded-2xl border p-3",
                  insight.direction === "up" ? "border-money-negative-border bg-money-negative-bg" : "border-badge-green-border bg-badge-green-bg"
                )}
              >
                <Icon
                  name={insight.direction === "up" ? "trendingUp" : "trendingDown"}
                  size={16}
                  className={cn("mt-0.5 shrink-0", insight.direction === "up" ? "text-money-negative-text" : "text-badge-green-text")}
                />
                <p className={cn("text-caption", insight.direction === "up" ? "text-money-negative-text" : "text-badge-green-text")}>{insight.message}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <p className="text-caption text-muted-foreground">Budget</p>
            <p className="mt-0.5 text-body font-semibold text-ink">{formatCurrency(totalBudgeted)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <p className="text-caption text-muted-foreground">Spent</p>
            <p className="mt-0.5 text-body font-semibold text-ink">{formatCurrency(totalActual)}</p>
          </div>
          <div className="rounded-2xl border border-border bg-white p-3 shadow-sm">
            <p className="text-caption text-muted-foreground">{totalRemaining < 0 ? "Over by" : "Remaining"}</p>
            <p className={cn("mt-0.5 text-body font-semibold", totalRemaining < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
              {formatCurrency(Math.abs(totalRemaining))}
            </p>
          </div>
        </div>

        {totalBudgeted > 0 && (
          <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
            <p className="mb-3 text-caption font-medium tracking-wide text-muted-foreground uppercase">Budget vs Actual</p>
            <BudgetVsActualChart months={spendTrend} budgetedAmount={totalBudgeted} highlightMonth={month} />
          </div>
        )}

        {recommendationCandidates.length > 0 && <BudgetRecommendationsCard candidates={recommendationCandidates} onApply={setCategoryBudget} />}

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-item-title font-semibold text-ink">Categories</h2>
            <Button size="sm" variant="outline" onClick={openAdd} disabled={unbudgetedCategories.length === 0}>
              <Icon name="plus" size={14} /> Add
            </Button>
          </div>

          {progress.length === 0 ? (
            <EmptyState
              icon="target"
              title="No budgets yet"
              description="Add a monthly $ target for a category to start tracking it here."
              action={
                <Button size="sm" className="bg-ink text-white hover:bg-ink/90" onClick={openAdd}>
                  <Icon name="plus" size={14} /> Add a budget
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
              {progress.map((p) => {
                const pct = p.budgeted > 0 ? (p.actual / p.budgeted) * 100 : 0;
                const over = p.remaining < 0;
                const near = !over && pct >= 80;
                const barColor = over ? "bg-money-negative-text" : near ? "bg-badge-orange-text" : "bg-badge-green-text";
                const remainingColor = over ? "text-money-negative-text" : "text-muted-foreground";
                return (
                  <button key={p.categoryId} type="button" onClick={() => openEdit(p.categoryId)} className="flex flex-col gap-1.5 px-4 py-3 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-body font-medium text-ink">{p.name}</span>
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {formatCurrency(p.actual)} of {formatCurrency(p.budgeted)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className={cn("h-full rounded-full", barColor)} style={{ width: `${Math.min(100, Math.max(p.actual > 0 ? 4 : 0, pct))}%` }} />
                    </div>
                    <span className={cn("text-caption", remainingColor)}>
                      {over ? `Over by ${formatCurrency(Math.abs(p.remaining))}` : `${formatCurrency(p.remaining)} left`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </TabsContent>

      <TabsContent value="zero-based">
        <ZeroBasedBudgetTab allocation={allocation} onSetTargetIncome={setTargetMonthlyIncome} />
      </TabsContent>

      <CategoryBudgetFormDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editingBudget && editingCategory ? { categoryId: editingCategory.id, categoryName: editingCategory.name, monthlyAmount: editingBudget.monthlyAmount } : undefined}
        unbudgetedCategories={unbudgetedCategories}
        onSubmit={(categoryId, monthlyAmount) => {
          setCategoryBudget(categoryId, monthlyAmount);
          toast.success("Budget saved");
        }}
        onDelete={(categoryId) => {
          deleteCategoryBudget(categoryId);
          toast.success("Budget removed");
        }}
      />
    </Tabs>
  );
}
