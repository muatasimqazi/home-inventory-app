"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Icon } from "@/components/icon";
import { PinnedLocationPhoto } from "@/components/pinned-location-photo";
import { PINNED_LOCATION_CATEGORIES, PINNED_LOCATION_CATEGORY_LABELS } from "@/lib/pinned-locations";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { PinnedLocationCategory } from "@/lib/types";

interface PinnedLocationFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialName?: string;
  initialCategory?: PinnedLocationCategory;
  initialLocationNote?: string;
  /** Existing photo, shown as the starting preview when editing. */
  initialPhotoPath?: string | null;
  onSubmit: (values: {
    name: string;
    category: PinnedLocationCategory;
    locationNote: string;
    photoFile?: File | null;
    removePhoto?: boolean;
  }) => void | Promise<void>;
}

/**
 * Create/Edit sheet for one Home Map pin (PRD §29) — name + category +
 * optional photo + optional "where exactly" note. Mirrors
 * entity-form-sheet.tsx's shape (Location/Container's own create/edit
 * sheet) with a category Select swapped in for the free-text description.
 * Same caller contract too: mount this behind a `key` tied to the record
 * being edited (or a remount-key for "create new"), since `open` here is
 * just a visibility prop, not a mount/unmount boundary — see that file's
 * own comment for the staleness bug this avoids.
 */
export function PinnedLocationFormSheet({
  open,
  onOpenChange,
  title,
  initialName = "",
  initialCategory = "water_shutoff",
  initialLocationNote = "",
  initialPhotoPath = null,
  onSubmit,
}: PinnedLocationFormSheetProps) {
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState<PinnedLocationCategory>(initialCategory);
  const [locationNote, setLocationNote] = useState(initialLocationNote);
  const [error, setError] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(nameInputRef, [open]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoRemoved, setPhotoRemoved] = useState(false);
  const [saving, setSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
    setPhotoRemoved(false);
  }

  function handleRemovePhoto() {
    setPhotoFile(null);
    setPhotoPreviewUrl(null);
    setPhotoRemoved(true);
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        category,
        locationNote: locationNote.trim(),
        photoFile,
        removePhoto: photoRemoved,
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const hasPhotoToRemove = photoPreviewUrl !== null || (initialPhotoPath !== null && !photoRemoved);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Photo (optional)</label>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-white"
            >
              {photoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreviewUrl} alt="" className="size-full object-cover" />
              ) : (
                <PinnedLocationPhoto
                  photoPath={photoRemoved ? null : (initialPhotoPath ?? null)}
                  category={category}
                  className="size-full rounded-xl"
                />
              )}
            </button>
            {hasPhotoToRemove && (
              <button
                type="button"
                onClick={handleRemovePhoto}
                className="mt-1 text-caption font-medium text-muted-foreground underline underline-offset-2"
              >
                Remove photo
              </button>
            )}
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Main Water Shutoff"
              className="h-11"
              ref={nameInputRef}
            />
            {error && <p className="mt-1 text-caption text-danger">{error}</p>}
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Category</label>
            <Select value={category} onValueChange={(v) => setCategory(v as PinnedLocationCategory)}>
              <SelectTrigger className="h-11 w-full bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PINNED_LOCATION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {PINNED_LOCATION_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Location (optional)</label>
            <Textarea
              value={locationNote}
              onChange={(e) => setLocationNote(e.target.value)}
              placeholder="e.g. Garage → East Wall"
              rows={2}
            />
          </div>

          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSubmit} disabled={saving}>
            {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
