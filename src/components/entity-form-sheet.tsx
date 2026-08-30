"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PhotoThumb } from "@/components/photo-thumb";
import { Icon } from "@/components/icon";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

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
  /** Optional tap-to-fill name suggestions (e.g. Location's UP reference list) shown as pill chips under the Name field. Omit to show none — Container creation and every "edit" use of this sheet don't pass it. */
  nameSuggestions?: string[];
  /**
   * When provided, shows a small "AI suggest" affordance next to the Name
   * label — tapping it calls this, and fills the Name field with whatever
   * it resolves to (never auto-saves; the user still has to tap Save, same
   * as picking a nameSuggestions chip). Return null when there's nothing
   * to suggest from (e.g. an empty container) rather than calling this at
   * all — the caller decides whether the affordance should even show, via
   * whether it passes this prop.
   */
  onSuggestName?: () => Promise<string | null>;
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
  nameSuggestions,
  onSuggestName,
}: EntityFormSheetProps) {
  // Lazy-seeded from initial* props, not reseeded via an effect — this only
  // stays correct because every caller mounts this component behind a
  // `key` tied to the record being edited (see locations/[id],
  // containers/[id]), forcing a real remount (and a fresh initializer run)
  // whenever the target record changes. Radix's Sheet only controls
  // *visibility*, not whether this outer component itself is mounted, so
  // without that key these would silently go stale after the first edit.
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [suggesting, setSuggesting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(nameInputRef, [open]);

  async function handleSuggestName() {
    if (!onSuggestName || suggesting) return;
    setSuggesting(true);
    try {
      const suggestion = await onSuggestName();
      if (suggestion) {
        setName(suggestion);
        if (error) setError(null);
      } else {
        toast("Nothing to suggest a name from yet.");
      }
    } catch {
      toast.error("Couldn't suggest a name. Please try again.");
    } finally {
      setSuggesting(false);
    }
  }

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
              className="flex size-20 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-card"
            >
              {photoPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoPreviewUrl} alt="" className="size-full object-contain" />
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
            <div className="mb-1 flex items-center justify-between">
              <label className="text-caption text-muted-foreground">Name</label>
              {onSuggestName && (
                <button
                  type="button"
                  onClick={handleSuggestName}
                  disabled={suggesting}
                  className="flex items-center gap-1 text-caption font-medium text-yellow-text disabled:opacity-60"
                >
                  {suggesting ? <Icon name="spinner" size={12} className="animate-spin" /> : <Icon name="ai" size={12} />}
                  {suggesting ? "Thinking…" : "AI suggest"}
                </button>
              )}
            </div>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={namePlaceholder}
              className="h-11"
              ref={nameInputRef}
            />
            {error && <p className="mt-1 text-caption text-danger">{error}</p>}
            {nameSuggestions && nameSuggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {nameSuggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => {
                      setName(suggestion);
                      if (error) setError(null);
                    }}
                    className="rounded-full bg-surface-muted px-3 py-1 text-caption font-medium text-ink transition-colors hover:bg-yellow hover:text-white"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Description (optional)</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
          <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
