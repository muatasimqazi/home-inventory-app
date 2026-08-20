import { cn } from "@/lib/utils";
import { coverPhotoUrl } from "@/lib/cover-photo";

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
  if (coverPhotoPath) {
    return (
      <div className={cn("overflow-hidden rounded-2xl bg-brand-100", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={coverPhotoUrl(coverPhotoPath)} alt="" className={cn("size-full", fit === "cover" ? "object-cover" : "object-contain")} />
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
