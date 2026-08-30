import Link from "next/link";
import { PhotoThumb } from "@/components/photo-thumb";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";

interface ContainerCardStatus {
  label: string;
  dotClassName: string;
}

interface ContainerCardProps {
  container: Container;
  itemCount: number;
  breadcrumbLabel: string;
  status?: ContainerCardStatus | null;
  className?: string;
}

/**
 * Container card — full-bleed photo (object-fit: cover, cropping as
 * needed, no letterboxing) with name/breadcrumb/count in a separate
 * caption area below it, not overlaid on top of the photo. Tried the
 * overlay-on-photo-with-gradient-scrim treatment first; reverted after
 * actual use — text-under-photo reads more clearly and matches the
 * caption placement every other card type (ItemCard, EntityCard) already
 * uses, which is exactly why those two also gained `fit="cover"` in the
 * same pass as this revert, so every card in the app now crops-to-fill
 * consistently instead of only containers doing so.
 */
export function ContainerCard({ container, itemCount, breadcrumbLabel, status, className }: ContainerCardProps) {
  return (
    <Link
      href={`/containers/${container.id}`}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-lg", className)}
    >
      <div className="relative aspect-4/3 w-full shrink-0 overflow-hidden">
        {/* absolute inset-0, not a normal-flow size-full child — a
            percentage-height image inside a box whose own height is
            *derived from* aspect-ratio doesn't reliably resolve against
            it (a real, confirmed-live CSS quirk: the box's rendered
            height ended up tracking each photo's own intrinsic aspect
            ratio instead of the intended 4:3, producing visibly
            different-sized cards depending on what photo a container
            happened to have). Taking the image out of flow entirely
            removes it from that sizing negotiation — the wrapper's
            height is then purely aspect-ratio's, unconditionally. */}
        <PhotoThumb
          emoji={container.coverPhotoEmoji ?? "📦"}
          coverPhotoPath={container.coverPhotoPath}
          className="absolute inset-0 size-full rounded-none"
          emojiClassName="text-8xl"
          fit="cover"
          enableLightbox
        />
        {container.displayCode && (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full border px-2 py-1 text-micro font-semibold",
              displayCodeBadgeClasses(container.id)
            )}
          >
            {container.displayCode}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <p className="truncate text-item-title font-medium text-ink">{container.name}</p>
        <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="text-caption text-ink">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          {status && (
            <span className="flex items-center gap-1 text-caption text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", status.dotClassName)} aria-hidden />
              {status.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
