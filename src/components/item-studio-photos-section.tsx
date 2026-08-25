"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { WardrobeStudioSheet } from "@/components/wardrobe-studio-sheet";
import { useInventoryStore } from "@/lib/store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { relativeTime } from "@/lib/format";
import type { Item, ItemStudioPhotoStyle } from "@/lib/types";

const STYLE_LABEL: Record<ItemStudioPhotoStyle, string> = {
  white_background: "White Background",
  transparent_background: "Transparent",
  studio_shadow: "Studio Shadow",
  boutique_flat_lay: "Boutique Flat Lay",
  neutral_lifestyle: "Neutral Lifestyle",
};

/**
 * Wardrobe Photo Studio's generation history for one item (docs/Wardrobe
 * Inventory.md, Phase 2's "generation history") — also the second entry
 * point into WardrobeStudioSheet ("Create Studio Photo," works for any
 * item, not just ones cataloged via the wardrobe capture flow). Omits
 * itself entirely when the item has no cover photo yet — there's nothing
 * to generate from, same "omit, don't show an empty dash" posture
 * LinkedBanksCard already established elsewhere in this app.
 */
export function ItemStudioPhotosSection({ item }: { item: Item }) {
  const itemStudioPhotos = useInventoryStore((s) => s.itemStudioPhotos);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const updateItem = useInventoryStore((s) => s.updateItem);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const photos = itemStudioPhotos.filter((p) => p.itemId === item.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (!item.coverPhotoPath) return null;
  const sourcePhotoPath = item.coverPhotoPath;

  async function handleRetry(photoId: string, style: ItemStudioPhotoStyle) {
    setRetryingId(photoId);
    try {
      const res = await fetch("/api/v1/vision/generate-studio-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: currentHouseholdId, itemId: item.id, originalPhotoPath: sourcePhotoPath, styles: [style], aspectRatio: "1:1" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Retry failed.");
      const [retried] = data.results as { status: string; errorMessage: string | null }[];
      if (retried.status === "complete") toast.success(`${STYLE_LABEL[style]} ready`);
      else toast.error(retried.errorMessage ?? "Retry failed.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Retry failed.");
    } finally {
      setRetryingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-body font-semibold text-ink">Studio Photos</h2>
        <Button size="sm" variant="outline" onClick={() => setSheetOpen(true)}>
          <Icon name="ai" size={14} /> Create Studio Photo
        </Button>
      </div>

      {photos.length === 0 ? (
        <p className="text-caption text-muted-foreground">No studio photos yet — generate clean, ecommerce-style photos of this item for reselling or listing.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <div key={p.id} className="flex flex-col gap-1">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
                {p.status === "complete" && p.generatedPhotoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={coverPhotoUrl(p.generatedPhotoPath)} alt={STYLE_LABEL[p.style]} className="size-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center gap-1 p-2 text-center">
                    <Icon name="danger" size={14} className="text-danger" />
                    {retryingId === p.id ? (
                      <Icon name="spinner" size={12} className="animate-spin text-muted-foreground" />
                    ) : (
                      <button type="button" onClick={() => handleRetry(p.id, p.style)} className="text-micro font-medium text-yellow-text">
                        Retry
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="truncate text-micro font-medium text-ink">{STYLE_LABEL[p.style]}</p>
              {p.status === "complete" && p.generatedPhotoPath && (
                <button type="button" onClick={() => updateItem(item.id, { coverPhotoPath: p.generatedPhotoPath! })} className="text-left text-micro text-yellow-text">
                  Set as cover
                </button>
              )}
              <p className="text-micro text-muted-foreground">{relativeTime(p.createdAt)}</p>
            </div>
          ))}
        </div>
      )}

      <WardrobeStudioSheet open={sheetOpen} onOpenChange={setSheetOpen} item={item} sourcePhotoPath={sourcePhotoPath} />
    </div>
  );
}
