import Link from "next/link";
import { PhotoThumb } from "@/components/photo-thumb";
import { binIdBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";

interface EntityCardProps {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  /** Container Bin ID, shown as a flat (no-shadow) pill. */
  badge?: string;
  /** Stable id to hash the badge's pastel color from (e.g. the container id). Falls back to neutral if omitted. */
  badgeKey?: string;
  className?: string;
}

/** Grid card for Locations List / Container children — thumbnail + name + count. */
export function EntityCard({ href, emoji, title, subtitle, badge, badgeKey, className }: EntityCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col overflow-hidden rounded-xl bg-white p-3 shadow-sm transition-shadow hover:shadow-lg",
        className
      )}
    >
      <div className="relative">
        <PhotoThumb emoji={emoji} className="aspect-[145/92] w-full" />
        {badge && (
          <span
            className={cn(
              "absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-micro font-semibold",
              badgeKey ? binIdBadgeClasses(badgeKey) : "border-border bg-surface-muted text-ink"
            )}
          >
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-item-title font-medium text-ink">{title}</p>
      <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
    </Link>
  );
}
