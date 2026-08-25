"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { FinanceCategory } from "@/lib/types";

interface CategoryBudgetFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Set when editing an existing budget — the category is then fixed (shown as plain text, not a picker) and a Remove action appears. Unset when adding a new one. */
  editing?: { categoryId: string; categoryName: string; monthlyAmount: number };
  /** Categories with no budget set yet — the picker's option list when adding (ignored when editing). */
  unbudgetedCategories: FinanceCategory[];
  onSubmit: (categoryId: string, monthlyAmount: number) => void;
  onDelete?: (categoryId: string) => void;
}

/**
 * Add or edit one category's standing monthly budget — Budgeting v1 (docs
 * note: scoped to per-category $ targets only, no zero-based allocation).
 * Dialog, not a bottom Sheet, matching category-form-dialog.tsx's shape
 * for the same reason: one or two short fields, not a form worth a full
 * sheet. Like that component, this stays mounted with `open` as a plain
 * prop — the parent page must pass a `key` from useRemountKey() (or
 * `editing.categoryId`) so each fresh open gets fresh initial state; see
 * that hook's own comment for why.
 */
export function CategoryBudgetFormDialog({ open, onOpenChange, editing, unbudgetedCategories, onSubmit, onDelete }: CategoryBudgetFormDialogProps) {
  const [categoryId, setCategoryId] = useState(editing?.categoryId ?? "");
  const [amount, setAmount] = useState(editing ? String(editing.monthlyAmount) : "");
  const [error, setError] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(amountInputRef, [open]);

  function handleSubmit() {
    if (!categoryId) {
      setError("Choose a category.");
      return;
    }
    const parsed = Number(amount);
    if (!amount || Number.isNaN(parsed) || parsed < 0) {
      setError("Enter a budget amount of 0 or more.");
      return;
    }
    onSubmit(categoryId, parsed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-section-title font-medium text-ink">{editing ? "Edit Budget" : "Add a Budget"}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {editing ? (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Category</label>
              <p className="text-body font-medium text-ink">{editing.categoryName}</p>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Category</label>
              {unbudgetedCategories.length === 0 ? (
                <p className="text-caption text-muted-foreground">Every category already has a budget.</p>
              ) : (
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    if (error) setError(null);
                  }}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Choose a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {unbudgetedCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Monthly budget</label>
            <Input
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (error) setError(null);
              }}
              placeholder="$0.00"
              className="h-11"
              inputMode="decimal"
              ref={amountInputRef}
            />
          </div>

          {error && <p className="text-caption text-danger">{error}</p>}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {editing && onDelete ? (
            <Button
              variant="outline"
              size="lg"
              className="flex-auto border-danger/30 text-danger"
              onClick={() => {
                onDelete(editing.categoryId);
                onOpenChange(false);
              }}
            >
              Remove
            </Button>
          ) : (
            <Button variant="outline" size="lg" className="flex-auto" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          <Button size="lg" className="flex-auto bg-ink text-white hover:bg-ink/90" onClick={handleSubmit}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
