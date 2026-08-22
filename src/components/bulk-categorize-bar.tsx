"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { sortByLabel } from "@/lib/selectors";
import type { FinanceCategory } from "@/lib/types";

interface BulkCategorizeBarProps {
  selectedCount: number;
  categories: FinanceCategory[];
  onApply: (categoryId: string) => void;
}

/**
 * Floating action bar shown while the transactions list is in select mode
 * (Bulk categorize workstream) — same fixed-bottom-bar + "N selected"
 * convention Trash's InventoryTrashPanel already uses for its bulk
 * Restore/Delete Forever actions (see src/app/(shell)/trash/page.tsx).
 * There's only one bulk action here (tag every selected transaction with
 * one more category), so "Add Category" opens a small bottom sheet of
 * category pills — same look TransactionFormSheet's own category picker
 * uses — and tapping one applies immediately rather than needing a
 * second "Apply" confirm tap.
 *
 * Purely additive: onApply is expected to call addTransactionCategory for
 * each selected transaction (tag-style — never clears anything a
 * transaction already has). This component only picks the category and
 * reports the choice; the page owns the selection set and the store call.
 */
export function BulkCategorizeBar({ selectedCount, categories, onApply }: BulkCategorizeBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const activeCategories = sortByLabel(
    categories.filter((c) => c.status === "active"),
    (c) => c.name
  );

  if (selectedCount === 0) return null;

  return (
    <>
      <div className="fixed inset-x-4 bottom-[calc(5.125rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg md:bottom-4">
        <span className="text-body">
          {selectedCount} transaction{selectedCount === 1 ? "" : "s"} selected
        </span>
        <Button
          size="sm"
          variant="outline"
          className="border-white/30 bg-transparent text-white hover:bg-white/10"
          onClick={() => setPickerOpen(true)}
        >
          <Icon name="tag" size={14} /> Add Category
        </Button>
      </div>

      <Sheet open={pickerOpen} onOpenChange={setPickerOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-section-title font-medium text-ink">
              Add category to {selectedCount} transaction{selectedCount === 1 ? "" : "s"}
            </SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-3 px-4 pb-6">
            <p className="text-caption text-muted-foreground">
              Adds this category to every selected transaction — doesn&rsquo;t remove any category they already have.
            </p>
            {activeCategories.length === 0 ? (
              <p className="text-caption text-muted-foreground">No categories yet — add one from a transaction&rsquo;s edit form first.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {activeCategories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onApply(c.id);
                      setPickerOpen(false);
                    }}
                    className="rounded-full bg-surface-muted px-3 py-1.5 text-caption font-medium text-ink transition-colors hover:bg-yellow hover:text-white"
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
