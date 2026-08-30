"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategoryFormDialog } from "@/components/category-form-dialog";
import { RuleFormDialog } from "@/components/rule-form-dialog";
import { useInventoryStore } from "@/lib/store";
import { sortByLabel } from "@/lib/selectors";
import { categoryBadgeClasses } from "@/lib/badge-color";
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
  const [query, setQuery] = useState("");

  const activeCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const filteredCategories = query.trim()
    ? activeCategories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : activeCategories;

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
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Categories & Rules</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Organize spending and automate categorization.</p>
        </div>
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
          <>
            {/* Only worth it once there's enough categories that scanning
                beats typing — the comment on the row-list below is the
                reason it's here at all: a household's full set is dozens. */}
            {activeCategories.length > 8 && (
              <SearchBar value={query} onChange={setQuery} placeholder="Search categories…" className="mb-2" />
            )}
            {filteredCategories.length === 0 ? (
              <EmptyState icon="search" title={`No categories match "${query.trim()}"`} description="Check the spelling or try a different word." />
            ) : (
              // A real row list, not wrapped pills — pills read fine as a
              // handful of inline tags (a transaction's 1-2 categories) but a
              // household's full category set is dozens of them: cramped into
              // wrapped pills, the trash/edit hit-targets shrink to be barely
              // tappable and a name can't ever truncate, it just pushes the
              // pill wider. One name per row, own line, actual tap targets —
              // same divide-y row-list convention as Rules right below.
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
                {filteredCategories.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-body font-semibold",
                        categoryBadgeClasses(c.id)
                      )}
                      aria-hidden
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </span>
                    <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{c.name}</p>
                    {c.householdId !== null && (
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCategory(c)}
                          aria-label={`Rename ${c.name}`}
                          className="tap-target flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
                        >
                          <Icon name="edit" size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setTrashConfirmId(c.id)}
                          aria-label={`Trash ${c.name}`}
                          className="tap-target flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
                        >
                          <Icon name="trash" size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
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
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
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
