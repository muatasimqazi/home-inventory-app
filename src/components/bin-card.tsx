import Link from "next/link";
import { binIdBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";
import type { Container } from "@/lib/types";

interface BinCardStatus {
  label: string;
  dotClassName: string;
}

interface BinCardProps {
  container: Container;
  itemCount: number;
  breadcrumbLabel: string;
  status?: BinCardStatus | null;
  className?: string;
}

/**
 * Bin/container card matching Figma v2's Dashboard "Storage bins" pattern:
 * photo flush to the card's top/left/right edges (no bottom rounding on the
 * photo itself), a flat hashed-color Bin ID badge, and a quiet status
 * dot+label that sits in the metadata row — never overlapping the badge.
 */
export function BinCard({ container, itemCount, breadcrumbLabel, status, className }: BinCardProps) {
  return (
    <Link
      href={`/containers/${container.id}`}
      className={cn("flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-sm transition-shadow hover:shadow-lg", className)}
    >
      <div className="relative flex h-26 items-center justify-center bg-brand-100">
        <span className="text-4xl" aria-hidden>
          {container.coverPhotoEmoji ?? "📦"}
        </span>
        {container.displayCode && (
          <span
            className={cn(
              "absolute left-2 top-2 rounded-full border px-2 py-1 text-micro font-semibold",
              binIdBadgeClasses(container.id)
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
