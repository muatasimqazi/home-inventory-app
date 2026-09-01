"use client";

import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import type { TaskCategoryRecord } from "@/lib/types";

const ADD_CATEGORY_VALUE = "__add_category__";

/**
 * Task category picker — real per-household data now
 * (0053_task_categories_and_subtasks.sql), not a fixed enum, so "add a
 * category" is a real in-app action instead of needing a migration every
 * time (0052's "grocery" was the last one that did). "+ Add category…"
 * is a sentinel option at the bottom of the same Select shadcn/radix
 * already gives every other picker in this app — opens a two-field-free
 * Dialog (just a name) rather than a full sheet, since that's genuinely
 * all creating a category needs. Mirrors getOrCreateTag's "type it, it
 * exists" model: picking an existing name just selects it, same as this
 * would if the user retyped one that already exists.
 */
export function TaskCategorySelect({ value, onChange }: { value: string; onChange: (categoryId: string) => void }) {
  const categories = useInventoryStore((s) => s.taskCategories);
  const getOrCreateTaskCategory = useInventoryStore((s) => s.getOrCreateTaskCategory);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  // Defaults (household_id null) first in their seeded order, then the
  // household's own custom ones alphabetically — same "defaults you
  // recognize, then yours" ordering Finance's category picker uses.
  const sorted = [...categories].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.isDefault ? 0 : a.name.localeCompare(b.name);
  });

  function handleSelect(id: string) {
    if (id === ADD_CATEGORY_VALUE) {
      setNewName("");
      setAddOpen(true);
      return;
    }
    onChange(id);
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    const category = getOrCreateTaskCategory(name);
    onChange(category.id);
    setAddOpen(false);
  }

  return (
    <>
      <Select value={value} onValueChange={handleSelect}>
        <SelectTrigger className="h-11 w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {sorted.map((c: TaskCategoryRecord) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
          <SelectItem value={ADD_CATEGORY_VALUE}>
            <span className="flex items-center gap-1.5 text-yellow-text">
              <Icon name="plus" size={14} /> Add category
            </span>
          </SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-xl sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-section-title font-medium text-ink">New category</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Meal prep"
            className="h-11"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleCreate} disabled={!newName.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
