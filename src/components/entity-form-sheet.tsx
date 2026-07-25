"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface EntityFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  namePlaceholder: string;
  initialName?: string;
  initialDescription?: string;
  onSubmit: (values: { name: string; description: string }) => void;
}

/** Shared Create/Edit sheet for Location and Container — name + optional description, nothing else. */
export function EntityFormSheet({
  open,
  onOpenChange,
  title,
  namePlaceholder,
  initialName = "",
  initialDescription = "",
  onSubmit,
}: EntityFormSheetProps) {
  // Radix's Sheet unmounts its content while closed, so these reset to the
  // latest initial* props each time it reopens — no effect-based sync needed.
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim() });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={namePlaceholder}
              className="h-11"
              autoFocus
            />
            {error && <p className="mt-1 text-caption text-danger">{error}</p>}
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Description (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <Button size="lg" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
