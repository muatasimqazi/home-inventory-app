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
 * Container card, v3 full-bleed treatment (supersedes the v2 "photo flush
 * to edges, caption beneath" layout — see the design-language reference):
 * the photo now fills the entire card (object-fit: cover, cropping as
 * needed) and name/breadcrumb/count sit directly on top of it, legible via
 * a bottom gradient scrim rather than a separate caption strip below the
 * photo. The Container ID badge stays top-left on the photo; the status
 * dot+label moves into the overlay's metadata row next to the item count,
 * since there's no more standalone caption area for it to live in.
 */
export function ContainerCard({ container, itemCount, breadcrumbLabel, status, className }: ContainerCardProps) {
  return (
    <Link
      href={`/containers/${container.id}`}
      className={cn(
        "relative flex aspect-4/5 flex-col justify-end overflow-hidden rounded-2xl border border-border shadow-sm transition-shadow hover:shadow-lg",
        className
      )}
    >
      <PhotoThumb
        emoji={container.coverPhotoEmoji ?? "📦"}
        coverPhotoPath={container.coverPhotoPath}
        className="absolute inset-0 size-full rounded-none"
        emojiClassName="text-8xl"
        fit="cover"
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

      {/* Bottom gradient scrim — dark enough near the bottom edge for white
          text to stay legible over an arbitrary photo, fully transparent by
          the midpoint so it doesn't wash out the photo itself. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-black/75 via-black/25 to-transparent" />

      <div className="relative flex flex-col gap-0.5 p-3 text-white">
        <p className="truncate text-item-title font-medium drop-shadow-sm">{container.name}</p>
        <p className="truncate text-caption text-white/80 drop-shadow-sm">{breadcrumbLabel}</p>
        <div className="mt-0.5 flex items-center justify-between">
          <span className="text-caption drop-shadow-sm">
            {itemCount} item{itemCount === 1 ? "" : "s"}
          </span>
          {status && (
            <span className="flex items-center gap-1 text-caption drop-shadow-sm">
              <span className={cn("size-1.5 rounded-full", status.dotClassName)} aria-hidden />
              {status.label}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
