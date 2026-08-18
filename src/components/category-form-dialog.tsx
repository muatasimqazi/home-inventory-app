"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CategoryFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  onSubmit: (name: string) => void;
}

/** Short, single-purpose modal — name only (parent-category nesting is one level per PRD §16, and not exposed in this pass' UI; categories created here are always top-level). */
export function CategoryFormDialog({ open, onOpenChange, initialName = "", onSubmit }: CategoryFormDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-section-title font-medium text-ink">{initialName ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-caption text-muted-foreground">Name</label>
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="e.g. Groceries"
            className="h-11"
            autoFocus
          />
          {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="lg" className="flex-auto" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="lg"
            className="flex-auto bg-ink text-white hover:bg-ink/90"
            onClick={() => {
              if (!name.trim()) {
                setError("Name is required.");
                return;
              }
              onSubmit(name.trim());
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
