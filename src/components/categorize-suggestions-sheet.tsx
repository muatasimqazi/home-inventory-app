"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { REVIEW_THRESHOLD } from "@/lib/ai";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinanceCategory, Transaction } from "@/lib/types";

/**
 * Review-and-confirm step for AI category suggestions (Household Ledger
 * Implementation Plan, Workstream 3 batch). Manual-trigger half of the
 * feature: the transactions list runs a batch "Suggest categories" pass
 * (lib/ai.ts's categorizationProvider), then hands the results here so the
 * user can adjust or skip each one before anything is written —
 * same assisted-not-automatic posture as link-purchase-sheet.tsx (PRD §25).
 * Applying is a separate explicit action (onApply) from opening this sheet;
 * nothing here ever calls addTransactionCategory on its own.
 */

export interface CategorizeSuggestionRow {
  transaction: Transaction;
  suggestedCategoryId: string | null;
  confidence: number;
}

interface CategorizeSuggestionsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: CategorizeSuggestionRow[];
  categories: FinanceCategory[];
  onApply: (accepted: { transactionId: string; categoryId: string }[]) => void;
}

export function CategorizeSuggestionsSheet({ open, onOpenChange, rows, categories, onApply }: CategorizeSuggestionsSheetProps) {
  // Per-row editable choice + include/skip, seeded once from `rows` via a
  // lazy initializer — reseeding on a fresh "Suggest categories" pass is
  // the caller's job via a `key` prop (same remount-to-reseed convention
  // transaction-form-sheet.tsx's createKey/detailTxn.id keys already use in
  // this codebase for a sheet that stays mounted across the page's whole
  // lifetime), not an effect here.
  const [choices, setChoices] = useState<Record<string, { categoryId: string; included: boolean }>>(() => {
    const initial: Record<string, { categoryId: string; included: boolean }> = {};
    for (const row of rows) {
      if (row.suggestedCategoryId) initial[row.transaction.id] = { categoryId: row.suggestedCategoryId, included: true };
    }
    return initial;
  });

  const includedCount = Object.values(choices).filter((c) => c.included).length;

  function toggleIncluded(transactionId: string) {
    setChoices((prev) => {
      const current = prev[transactionId];
      if (!current) return prev;
      return { ...prev, [transactionId]: { ...current, included: !current.included } };
    });
  }

  function setCategory(transactionId: string, categoryId: string) {
    setChoices((prev) => ({ ...prev, [transactionId]: { categoryId, included: prev[transactionId]?.included ?? true } }));
  }

  function handleApply() {
    const accepted = Object.entries(choices)
      .filter(([, c]) => c.included)
      .map(([transactionId, c]) => ({ transactionId, categoryId: c.categoryId }));
    onApply(accepted);
    onOpenChange(false);
  }

  const activeCategories = categories.filter((c) => c.status === "active");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-1.5 text-section-title font-medium text-ink">
            <Icon name="ai" size={18} className="text-yellow" /> AI category suggestions
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          <p className="text-caption text-muted-foreground">
            Review each suggestion, adjust the category if it&apos;s wrong, and uncheck any you&apos;d rather leave for later. Nothing is applied until you tap Apply.
          </p>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-caption text-muted-foreground">No suggestions to review.</p>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
              {rows.map((row) => {
                const choice = choices[row.transaction.id];
                const t = row.transaction;
                const lowConfidence = row.confidence < REVIEW_THRESHOLD;
                return (
                  <div key={t.id} className="flex flex-col gap-2 px-3 py-2.5">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={choice?.included ?? false}
                        onChange={() => toggleIncluded(t.id)}
                        disabled={!row.suggestedCategoryId}
                        className="mt-1 size-4 shrink-0"
                        aria-label={`Include ${t.merchant ?? t.description ?? "transaction"}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                        <p className="text-caption text-muted-foreground">{formatCurrency(t.amount, { showPositiveSign: true })}</p>
                      </div>
                      {lowConfidence && row.suggestedCategoryId && (
                        <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro font-medium text-muted-foreground">Low confidence</span>
                      )}
                    </div>

                    {row.suggestedCategoryId ? (
                      <div className="pl-6">
                        <Select value={choice?.categoryId} onValueChange={(v) => setCategory(t.id, v)}>
                          <SelectTrigger className={cn("h-9 w-full", !choice?.included && "opacity-50")}>
                            <SelectValue placeholder="Choose a category" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeCategories.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="pl-6 text-caption text-muted-foreground">AI couldn&apos;t confidently match a category for this one.</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <Button onClick={handleApply} disabled={includedCount === 0} className="h-11 w-full">
            Apply {includedCount > 0 ? `(${includedCount})` : ""}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
