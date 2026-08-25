"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { useInventoryStore } from "@/lib/store";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";
import { useRemountKey } from "@/hooks/use-remount-key";
import type { FinanceCategory } from "@/lib/types";

export default function CategoriesAndRulesPage() {
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const categoryRules = useInventoryStore((s) => s.categoryRules);
  const createFinanceCategory = useInventoryStore((s) => s.createFinanceCategory);
  const updateFinanceCategory = useInventoryStore((s) => s.updateFinanceCategory);
  const trashFinanceCategory = useInventoryStore((s) => s.trashFinanceCategory);
  const createCategoryRule = useInventoryStore((s) => s.createCategoryRule);
  const deleteCategoryRule = useInventoryStore((s) => s.deleteCategoryRule);

  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [categoryDialogKey, bumpCategoryDialogKey] = useRemountKey();
  // Same dialog as "Add" (category-form-dialog.tsx already supports an
  // initialName + "Edit Category" title for exactly this) — set instead of
  // opening the add dialog when the tap is on an existing category's own
  // edit button, so submit renames it instead of creating a new one.
  const [editingCategory, setEditingCategory] = useState<FinanceCategory | null>(null);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleDialogKey, bumpRuleDialogKey] = useRemountKey();
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);

  const activeCategories = financeCategories.filter((c) => c.status === "active");

  function handleTrashCategory(id: string) {
    // The DB blocks this outright (prevent_trash_referenced_category(),
    // PRD §32.6) if any non-trashed transaction still references it —
    // persistOrRevert's normal error path surfaces that as a toast, no
    // special-casing needed here beyond attempting it.
    trashFinanceCategory(id);
    toast.success("Category trashed");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Categories & Rules</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Organize spending and automate categorization.</p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Categories</h2>
          <Button size="sm" variant="outline" onClick={() => { bumpCategoryDialogKey(); setCategoryDialogOpen(true); }}>
            <Icon name="plus" size={14} /> Add
          </Button>
        </div>
        {activeCategories.length === 0 ? (
          <EmptyState icon="pieChart" title="No categories yet" description="Default categories will appear here, or add your own." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {activeCategories.map((c) => (
              <div
                key={c.id}
                className={cn("flex items-center gap-1.5 rounded-full border py-1.5 pr-1.5 pl-3 text-caption font-medium", displayCodeBadgeClasses(c.id))}
              >
                {c.name}
                {c.householdId !== null && (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingCategory(c)}
                      aria-label={`Rename ${c.name}`}
                      className="flex size-5 items-center justify-center rounded-full bg-white/50"
                    >
                      <Icon name="edit" size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrashConfirmId(c.id)}
                      aria-label={`Trash ${c.name}`}
                      className="flex size-5 items-center justify-center rounded-full bg-white/50"
                    >
                      <Icon name="trash" size={11} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Rules</h2>
          <Button size="sm" variant="outline" onClick={() => { bumpRuleDialogKey(); setRuleDialogOpen(true); }} disabled={activeCategories.length === 0}>
            <Icon name="plus" size={14} /> Add
          </Button>
        </div>
        {categoryRules.length === 0 ? (
          <EmptyState icon="repeat" title="No rules yet" description="Rules auto-categorize future transactions by merchant or description." />
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
            {categoryRules.map((rule) => {
              const category = financeCategories.find((c) => c.id === rule.categoryId);
              return (
                <div key={rule.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 text-body text-ink">
                    When <span className="font-medium">{rule.matchField}</span> contains{" "}
                    <span className="font-medium">&ldquo;{rule.matchValue}&rdquo;</span> → {category?.name ?? "—"}
                  </div>
                  <button type="button" onClick={() => deleteCategoryRule(rule.id)} aria-label="Delete rule" className="shrink-0 text-muted-foreground">
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CategoryFormDialog
        key={categoryDialogKey}
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        onSubmit={(name) => {
          createFinanceCategory({ name });
          toast.success(`Added ${name}`);
        }}
      />

      <CategoryFormDialog
        key={editingCategory?.id}
        open={editingCategory !== null}
        onOpenChange={(open) => !open && setEditingCategory(null)}
        initialName={editingCategory?.name}
        onSubmit={(name) => {
          if (!editingCategory) return;
          updateFinanceCategory(editingCategory.id, { name });
          toast.success(`Renamed to ${name}`);
        }}
      />

      <RuleFormDialog
        key={ruleDialogKey}
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        categories={financeCategories}
        onSubmit={(values) => {
          createCategoryRule(values);
          toast.success("Rule saved");
        }}
      />

      <ConfirmDialog
        open={!!trashConfirmId}
        onOpenChange={(open) => !open && setTrashConfirmId(null)}
        title="Trash this category?"
        description="Blocked if any transaction still uses it — reassign those first."
        confirmLabel="Trash"
        icon="trash"
        onConfirm={() => {
          if (trashConfirmId) handleTrashCategory(trashConfirmId);
        }}
      />
    </div>
  );
}
