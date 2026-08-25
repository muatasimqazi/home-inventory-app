"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { Skeleton } from "@/components/ui/skeleton";

interface PhotoThumbProps {
  emoji: string;
  /** Real cover photo path (Item/Location/Container.coverPhotoPath) — when set, renders the actual photo instead of the emoji fallback. */
  coverPhotoPath?: string | null;
  label?: string;
  className?: string;
  emojiClassName?: string;
  /** "contain" (default) shows the whole photo, letterboxed if needed — the right choice for most contexts (item photos, form previews). "cover" fills the box edge-to-edge, cropping as needed — v3's full-bleed treatment for storage-container cards specifically, opt-in per caller rather than a global default so existing letterboxed contexts don't silently start cropping. */
  fit?: "contain" | "cover";
}

/**
 * A real photo when the item has one; otherwise a pale brand-tinted panel +
 * emoji, so the fallback still reads as designed rather than a flat gray
 * placeholder box.
 */
export function PhotoThumb({ emoji, coverPhotoPath, label, className, emojiClassName, fit = "contain" }: PhotoThumbProps) {
  // Real photos load from Supabase Storage — not instant, and this
  // component is used everywhere (item/container/location cards and
  // detail pages) with nothing shown in the meantime before this: a blank
  // box that abruptly popped a photo into once the network resolved.
  // Reset during render on coverPhotoPath change (React's documented
  // "adjust state when a prop changes" pattern — see e.g.
  // add-person-sheet.tsx's prevOpen for the same idiom elsewhere in this
  // app), not a setState-in-effect, which fires a wasted extra render
  // after the DOM's already painted with the stale `loaded` value — the
  // same DOM node can go from one item's photo to another's without
  // remounting (e.g. a Realtime-driven update swapping which cover photo
  // a row shows).
  const [loaded, setLoaded] = useState(false);
  const [prevPath, setPrevPath] = useState(coverPhotoPath);
  if (coverPhotoPath !== prevPath) {
    setPrevPath(coverPhotoPath);
    setLoaded(false);
  }

  if (coverPhotoPath) {
    return (
      <div className={cn("relative overflow-hidden rounded-2xl bg-brand-100", className)}>
        {!loaded && <Skeleton className="absolute inset-0 rounded-none bg-brand-100/60" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverPhotoUrl(coverPhotoPath)}
          alt=""
          onLoad={() => setLoaded(true)}
          // A failed load (404, network error) should still clear the
          // skeleton rather than pulse forever — the img itself just
          // renders blank/broken at that point, same as before this
          // change, but at least not stuck "loading" indefinitely.
          onError={() => setLoaded(true)}
          className={cn(
            "size-full transition-opacity duration-200",
            fit === "cover" ? "object-cover" : "object-contain",
            loaded ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-brand-100",
        className
      )}
    >
      <span className={cn("text-7xl leading-none", emojiClassName)} aria-hidden>
        {emoji}
      </span>
      {label ? <span className="text-caption text-yellow/80">{label}</span> : null}
    </div>
  );
}
