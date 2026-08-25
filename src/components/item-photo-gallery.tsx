"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { rotateStoredPhoto } from "@/lib/crop-image";
import { useInventoryStore } from "@/lib/store";
import { WARDROBE_STYLE_LABEL } from "@/lib/wardrobe-styles";
import { cn } from "@/lib/utils";
import type { Item, ItemStudioPhoto } from "@/lib/types";

interface GalleryPhoto {
  path: string;
  isCover: boolean;
  label?: string;
}

/**
 * Ecommerce-style product gallery for the item detail page — one big
 * hero image + a thumbnail strip below for switching between every
 * photo the item has (its own cover photo, then each completed Wardrobe
 * Photo Studio style), replacing the old fixed h-48 single-PhotoThumb
 * block. The active thumbnail's own actions swap depending on what it
 * is: the cover photo gets the existing rotate/remove/change-photo
 * controls (unchanged behavior, just relocated here); a generated
 * studio photo gets a "Set as cover" action instead — generated photos
 * aren't user-editable, they're regenerate-or-keep outputs.
 *
 * Falls back to the original bare "add a photo" empty state when the
 * item has no cover photo at all yet (nothing to gallery).
 */
export function ItemPhotoGallery({ item, studioPhotos }: { item: Item; studioPhotos: ItemStudioPhoto[] }) {
  const setItemCoverPhoto = useInventoryStore((s) => s.setItemCoverPhoto);
  const removeItemCoverPhoto = useInventoryStore((s) => s.removeItemCoverPhoto);
  const updateItem = useInventoryStore((s) => s.updateItem);

  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [rotatingPhoto, setRotatingPhoto] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const photos: GalleryPhoto[] = [
    ...(item.coverPhotoPath ? [{ path: item.coverPhotoPath, isCover: true }] : []),
    ...studioPhotos
      .filter((p) => p.status === "complete" && p.generatedPhotoPath)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((p) => ({ path: p.generatedPhotoPath!, isCover: false, label: WARDROBE_STYLE_LABEL[p.style] })),
  ];

  const safeIndex = Math.min(activeIndex, Math.max(0, photos.length - 1));
  const active: GalleryPhoto | undefined = photos[safeIndex];

  async function handlePhotoChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingPhoto(true);
    const result = await setItemCoverPhoto(item.id, file);
    setUploadingPhoto(false);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't set photo.");
      return;
    }
    toast.success("Photo updated");
    setActiveIndex(0); // the (possibly new) cover photo is always first
  }

  // Same rotate behavior the page always had — works on any saved cover
  // photo, not just freshly-captured ones (see the original comment this
  // moved from: a bulk multi-item capture crops its cover automatically
  // and never goes through the interactive crop step's rotate control).
  async function handleRotatePhoto() {
    if (!item.coverPhotoPath) return;
    setRotatingPhoto(true);
    try {
      const rotated = await rotateStoredPhoto(coverPhotoUrl(item.coverPhotoPath), 90);
      const result = await setItemCoverPhoto(item.id, rotated);
      if (!result.ok) toast.error(result.error ?? "Couldn't rotate photo.");
    } catch {
      toast.error("Couldn't rotate photo.");
    } finally {
      setRotatingPhoto(false);
    }
  }

  function handleSetAsCover(path: string) {
    updateItem(item.id, { coverPhotoPath: path });
    setActiveIndex(0);
    toast.success("Set as cover photo");
  }

  if (!active) {
    return (
      <div className="relative">
        <PhotoThumb emoji={item.photoEmoji} coverPhotoPath={null} className="aspect-square w-full" emojiClassName="text-8xl" fit="cover" />
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={uploadingPhoto}
          aria-label="Add photo"
          className="tap-target absolute bottom-2 right-2 flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
        >
          {uploadingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="camera" size={16} />}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-surface-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverPhotoUrl(active.path)} alt={active.label ?? item.name} className="size-full object-cover" />
        <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChosen} />

        {active.label && <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2.5 py-1 text-micro font-medium text-white">{active.label}</span>}

        {active.isCover ? (
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={handleRotatePhoto}
              disabled={rotatingPhoto}
              aria-label="Rotate photo"
              className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
            >
              {rotatingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="rotate" size={16} />}
            </button>
            <button
              type="button"
              onClick={() => removeItemCoverPhoto(item.id)}
              aria-label="Remove photo"
              className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm"
            >
              <Icon name="close" size={16} />
            </button>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              aria-label="Change photo"
              className="tap-target flex size-9 items-center justify-center rounded-full bg-white/90 shadow-sm disabled:opacity-60"
            >
              {uploadingPhoto ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="camera" size={16} />}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => handleSetAsCover(active.path)}
            className="tap-target absolute bottom-2 right-2 rounded-full bg-white/90 px-3 text-caption font-medium text-ink shadow-sm"
          >
            Set as cover
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <div className="scrollbar-hide flex gap-2 overflow-x-auto">
          {photos.map((p, i) => (
            <button
              key={p.path + i}
              type="button"
              onClick={() => setActiveIndex(i)}
              aria-label={p.label ?? "Cover photo"}
              className={cn("size-14 shrink-0 overflow-hidden rounded-lg border-2", i === safeIndex ? "border-ink" : "border-transparent")}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={coverPhotoUrl(p.path)} alt={p.label ?? item.name} className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
