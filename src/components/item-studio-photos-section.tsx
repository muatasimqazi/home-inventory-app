"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { WardrobeStudioSheet } from "@/components/wardrobe-studio-sheet";
import { useInventoryStore } from "@/lib/store";
import { WARDROBE_STYLE_LABEL } from "@/lib/wardrobe-styles";
import type { Item, ItemStudioPhotoStyle } from "@/lib/types";

/**
 * Wardrobe Photo Studio's generate/retry controls for one item (docs/
 * Wardrobe Inventory.md). Every *completed* photo already shows up in
 * ItemPhotoGallery above (the item page's hero + thumbnail strip) — this
 * section stays focused on what that gallery can't show: the "Create
 * Studio Photo" trigger itself, and any failed attempt still needing a
 * retry (nothing to put in a photo gallery for a generation that has no
 * image). Omits itself entirely when the item has no cover photo yet —
 * there's nothing to generate from, same "omit, don't show an empty
 * dash" posture LinkedBanksCard already established elsewhere.
 */
export function ItemStudioPhotosSection({ item }: { item: Item }) {
  const itemStudioPhotos = useInventoryStore((s) => s.itemStudioPhotos);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const photos = itemStudioPhotos.filter((p) => p.itemId === item.id);
  const failed = photos.filter((p) => p.status === "failed").sort((a, b) => b.createdAt.localeCompare(a.createdAt));

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
      if (retried.status === "complete") toast.success(`${WARDROBE_STYLE_LABEL[style]} ready`);
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

      {photos.length === 0 && (
        <p className="text-caption text-muted-foreground">Generate clean, ecommerce-style photos of this item for reselling or listing.</p>
      )}

      {failed.length > 0 && (
        <div className="flex flex-col divide-y divide-border">
          {failed.map((p) => (
            <div key={p.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <Icon name="danger" size={16} className="shrink-0 text-danger" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-caption font-medium text-ink">{WARDROBE_STYLE_LABEL[p.style]}</p>
                <p className="truncate text-micro text-muted-foreground">{p.errorMessage ?? "Generation failed"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleRetry(p.id, p.style)} disabled={retryingId === p.id}>
                {retryingId === p.id ? <Icon name="spinner" size={14} className="animate-spin" /> : "Retry"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <WardrobeStudioSheet open={sheetOpen} onOpenChange={setSheetOpen} item={item} sourcePhotoPath={sourcePhotoPath} />
    </div>
  );
}
