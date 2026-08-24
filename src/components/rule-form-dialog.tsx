"use client";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sortByLabel } from "@/lib/selectors";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { FinanceCategory } from "@/lib/types";

interface RuleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: FinanceCategory[];
  onSubmit: (values: { matchField: "merchant" | "description"; matchValue: string; categoryId: string }) => void;
}

/** Short, single-purpose modal (docs/Personal Finance PRD.md §35 "18 · Rule Form"). Forward-only — applies to future transactions, never retroactively (PRD §16/§32.1), stated inline so it's not a surprise after saving. */
export function RuleFormDialog({ open, onOpenChange, categories, onSubmit }: RuleFormDialogProps) {
  const [matchField, setMatchField] = useState<"merchant" | "description">("merchant");
  const [matchValue, setMatchValue] = useState("");
  const activeCategories = sortByLabel(
    categories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const [categoryId, setCategoryId] = useState(activeCategories[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const matchValueInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(matchValueInputRef, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-section-title font-medium text-ink">New Rule</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-caption text-muted-foreground">Applies to future transactions only, not existing ones.</p>
          <div className="flex items-center gap-2 text-body text-ink">
            <span>When</span>
            <Select value={matchField} onValueChange={(v) => setMatchField(v as "merchant" | "description")}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="merchant">merchant</SelectItem>
                <SelectItem value="description">description</SelectItem>
              </SelectContent>
            </Select>
            <span>contains</span>
          </div>
          <Input
            value={matchValue}
            onChange={(e) => {
              setMatchValue(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Whole Foods"
            className="h-11"
            ref={matchValueInputRef}
          />
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Set category to</label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-11 w-full">
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
          {error && <p className="text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-auto bg-ink text-white hover:bg-ink/90"
            onClick={() => {
              if (!matchValue.trim() || !categoryId) {
                setError("Fill in both fields.");
                return;
              }
              onSubmit({ matchField, matchValue: matchValue.trim(), categoryId });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
