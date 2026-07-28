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
 * Container card matching Figma v2's Dashboard "Storage containers" pattern:
 * photo flush to the card's top/left/right edges (no bottom rounding on the
 * photo itself), a flat hashed-color Container ID badge, and a quiet status
 * dot+label that sits in the metadata row — never overlapping the badge.
 */
export function ContainerCard({ container, itemCount, breadcrumbLabel, status, className }: ContainerCardProps) {
  return (
    <Link
      href={`/containers/${container.id}`}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-lg", className)}
    >
      <div className="relative h-26">
        <PhotoThumb
          emoji={container.coverPhotoEmoji ?? "📦"}
          coverPhotoPath={container.coverPhotoPath}
          className="size-full rounded-none"
          emojiClassName="text-8xl"
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
