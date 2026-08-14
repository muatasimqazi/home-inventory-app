"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoThumb } from "@/components/photo-thumb";

interface EntityFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  namePlaceholder: string;
  initialName?: string;
  initialDescription?: string;
  /** Existing cover photo, shown as the starting preview when editing — lets a photo already be swapped without leaving the sheet. */
  initialCoverPhotoPath?: string | null;
  initialCoverPhotoEmoji?: string;
  /** Omit to hide the photo picker entirely (not every caller wants one). When present, a chosen file is handed back on submit for the caller to upload once the entity itself exists. */
  onSubmit: (values: { name: string; description: string; photoFile?: File | null }) => void;
}

/** Shared Create/Edit sheet for Location and Container — name + optional description + optional cover photo. */
export function EntityFormSheet({
  open,
  onOpenChange,
  title,
  namePlaceholder,
  initialName = "",
  initialDescription = "",
  initialCoverPhotoPath = null,
  initialCoverPhotoEmoji = "📦",
  onSubmit,
}: EntityFormSheetProps) {
  // Radix's Sheet unmounts its content while closed, so these reset to the
  // latest initial* props each time it reopens — no effect-based sync needed.
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    onSubmit({ name: name.trim(), description: description.trim(), photoFile });
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
                <PhotoThumb emoji={initialCoverPhotoEmoji} coverPhotoPath={initialCoverPhotoPath} className="size-full" emojiClassName="text-3xl" />
              )}
            </button>
            {photoPreviewUrl && (
              <button
                type="button"
                onClick={() => {
                  setPhotoFile(null);
                  setPhotoPreviewUrl(null);
                }}
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
          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
