"use client";

import { Icon } from "@/components/icon";
import { useLightboxStore } from "@/lib/lightbox-store";
import { cn } from "@/lib/utils";

interface PhotoExpandButtonProps {
  /** Storage path(s) (or already-resolved URLs — coverPhotoUrl passes those through unchanged) to hand the lightbox, in display order. */
  photos: string[];
  index?: number;
  className?: string;
}

/**
 * Small corner affordance that opens PhotoLightbox without disturbing
 * whatever the photo is already wrapped in — most thumbnails across the
 * app (ItemCard, ContainerCard, EntityCard, ...) sit inside a Link that
 * navigates to the entity's own detail page, so this button (not the
 * photo itself) is the tap target: stopPropagation + preventDefault keep
 * the tap from also firing that Link.
 */
export function PhotoExpandButton({ photos, index = 0, className }: PhotoExpandButtonProps) {
  const openLightbox = useLightboxStore((s) => s.openLightbox);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(photos, index);
      }}
      aria-label="View larger"
      className={cn("tap-target flex size-7 items-center justify-center rounded-full bg-black/40 text-white", className)}
    >
      <Icon name="maximize" size={13} />
    </button>
  );
}
