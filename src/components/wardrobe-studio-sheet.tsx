"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { WARDROBE_STYLE_LABEL, stylesForCategory } from "@/lib/wardrobe-styles";
import { cn } from "@/lib/utils";
import type { Item, ItemStudioPhoto, ItemStudioPhotoAspectRatio, ItemStudioPhotoStyle } from "@/lib/types";

// Ghost Mannequin front + profile by default (user request) — the most
// ecommerce-relevant treatment for an actual garment, as two genuinely
// different angles rather than one. Was Ghost Mannequin alone; adding
// white_background/studio_shadow as a 2nd photo just produced another
// front-on view with a different background, not a second angle, so it
// read as a near-duplicate of the first. ghost_mannequin_profile is
// built specifically to pair with the front shot — a real rotation, not
// another straight-on style — so defaulting to both now gives two
// actually-different photos instead of two similar-looking ones.
//
// Both are garment-only (see GARMENT_ONLY_STYLES in wardrobe-styles.ts),
// so they're only a sensible default for a Clothing item — everything
// else falls back to the two universal, always-applicable treatments.
const DEFAULT_CLOTHING_STYLES: ItemStudioPhotoStyle[] = ["ghost_mannequin", "ghost_mannequin_profile"];
const DEFAULT_GENERAL_STYLES: ItemStudioPhotoStyle[] = ["white_background", "studio_shadow"];
const MAX_STYLES = 3;

/**
 * Wardrobe Photo Studio's generation step (docs/Wardrobe Inventory.md) —
 * the one reusable piece behind two entry points: the wardrobe capture
 * flow (opened right after a new item is created) and any existing
 * item's detail page ("Create Studio Photo" button, works for any item,
 * not just clothing). A bottom Sheet, not its own route — same shape as
 * container-wizard-sheet.tsx.
 *
 * Generation is synchronous (see migration 0043's own comment) — no
 * queued/processing state to poll, just a single "Generating…" wait
 * while the request is in flight, then a results grid.
 */
export function WardrobeStudioSheet({
  open,
  onOpenChange,
  item,
  sourcePhotoPath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: Item;
  sourcePhotoPath: string;
}) {
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const updateItem = useInventoryStore((s) => s.updateItem);

  // Garment-only styles (Ghost Mannequin, Boutique Flat Lay) only make
  // sense for an actual piece of clothing — this sheet is also the item
  // detail page's "Create Studio Photo" entry point, which works for any
  // item, not just Wardrobe ones, so a lamp or an appliance shouldn't be
  // offered a treatment that presupposes a worn garment.
  const availableStyles = stylesForCategory(item.category);
  const isClothing = item.category === "Clothing";

  const [selectedStyles, setSelectedStyles] = useState<Set<ItemStudioPhotoStyle>>(
    new Set(isClothing ? DEFAULT_CLOTHING_STYLES : DEFAULT_GENERAL_STYLES)
  );
  const [aspectRatio, setAspectRatio] = useState<ItemStudioPhotoAspectRatio>("1:1");
  const [generating, setGenerating] = useState(false);
  const [retryingStyle, setRetryingStyle] = useState<ItemStudioPhotoStyle | null>(null);
  const [results, setResults] = useState<ItemStudioPhoto[]>([]);

  function toggleStyle(style: ItemStudioPhotoStyle) {
    setSelectedStyles((prev) => {
      const next = new Set(prev);
      if (next.has(style)) next.delete(style);
      else if (next.size < MAX_STYLES) next.add(style);
      return next;
    });
  }

  async function requestGeneration(styles: ItemStudioPhotoStyle[]): Promise<ItemStudioPhoto[]> {
    const res = await fetch("/api/v1/vision/generate-studio-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId: currentHouseholdId, itemId: item.id, originalPhotoPath: sourcePhotoPath, styles, aspectRatio }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Couldn't generate studio photos.");
    return data.results as ItemStudioPhoto[];
  }

  async function handleGenerate() {
    if (selectedStyles.size === 0) {
      toast.error("Choose at least one style.");
      return;
    }
    setGenerating(true);
    setResults([]);
    try {
      const generated = await requestGeneration([...selectedStyles]);
      setResults(generated);
      const failedCount = generated.filter((r) => r.status === "failed").length;
      if (failedCount === 0) toast.success("Studio photos ready");
      else if (failedCount < generated.length) toast.error(`${failedCount} of ${generated.length} styles failed — the rest are ready.`);
      else toast.error("Couldn't generate any of the selected styles.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't generate studio photos.");
    } finally {
      setGenerating(false);
    }
  }

  async function handleRetry(style: ItemStudioPhotoStyle) {
    setRetryingStyle(style);
    try {
      const [retried] = await requestGeneration([style]);
      setResults((prev) => [...prev.filter((r) => r.style !== style), retried]);
      if (retried.status === "complete") toast.success(`${WARDROBE_STYLE_LABEL[style]} ready`);
      else toast.error(retried.errorMessage ?? "Retry failed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setRetryingStyle(null);
    }
  }

  function handleSaveAsCover(path: string) {
    updateItem(item.id, { coverPhotoPath: path });
    toast.success("Set as cover photo");
    // Closes this sheet — from the wardrobe capture flow, its parent's
    // onOpenChange(false) handler is what actually navigates to the
    // item page; from the item detail page's own "Create Studio Photo"
    // entry point, closing is already the whole story (already there).
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Create Studio Photo</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <p className="mb-2 text-caption text-muted-foreground">Styles (up to {MAX_STYLES})</p>
            <div className="flex flex-wrap gap-2">
              {availableStyles.map((style) => {
                const checked = selectedStyles.has(style);
                const disabled = !checked && selectedStyles.size >= MAX_STYLES;
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => toggleStyle(style)}
                    disabled={disabled}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-caption font-medium",
                      checked ? "border-ink bg-ink text-white" : "border-border bg-white text-ink",
                      disabled && "opacity-40"
                    )}
                  >
                    {WARDROBE_STYLE_LABEL[style]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-caption text-muted-foreground">Aspect ratio</p>
            <div className="flex gap-0.5 self-start rounded-lg bg-surface-muted p-0.75" style={{ width: "fit-content" }}>
              {(["1:1", "4:5"] as ItemStudioPhotoAspectRatio[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-caption font-semibold transition-colors",
                    aspectRatio === ratio ? "bg-white text-yellow shadow-sm" : "text-muted-foreground"
                  )}
                >
                  {ratio === "1:1" ? "Square" : "Portrait"}
                </button>
              ))}
            </div>
          </div>

          <Button size="lg" className="w-full bg-ink text-white hover:bg-ink/90" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Icon name="spinner" size={16} className="animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Icon name="ai" size={16} /> Generate
              </>
            )}
          </Button>

          {results.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {results.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 rounded-2xl border border-border bg-white p-2">
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
                    {r.status === "complete" && r.generatedPhotoPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={coverPhotoUrl(r.generatedPhotoPath)} alt={WARDROBE_STYLE_LABEL[r.style]} className="size-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-3 text-center">
                        <Icon name="danger" size={18} className="text-danger" />
                        <p className="text-micro text-muted-foreground">{r.errorMessage ?? "Failed"}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-center text-caption font-medium text-ink">{WARDROBE_STYLE_LABEL[r.style]}</p>
                  {r.status === "complete" && r.generatedPhotoPath ? (
                    <div className="flex flex-col gap-1.5">
                      <Button className="h-11 w-full bg-ink text-white hover:bg-ink/90" onClick={() => handleSaveAsCover(r.generatedPhotoPath!)}>
                        Save as cover
                      </Button>
                      <a
                        href={coverPhotoUrl(r.generatedPhotoPath)}
                        target="_blank"
                        rel="noreferrer"
                        className="tap-target flex items-center justify-center text-caption font-medium text-yellow-text"
                      >
                        Download
                      </a>
                    </div>
                  ) : (
                    <Button variant="outline" className="h-11 w-full" onClick={() => handleRetry(r.style)} disabled={retryingStyle === r.style}>
                      {retryingStyle === r.style ? <Icon name="spinner" size={14} className="animate-spin" /> : "Retry"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
