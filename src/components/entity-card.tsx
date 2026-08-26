import Link from "next/link";
import { PhotoThumb } from "@/components/photo-thumb";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { cn } from "@/lib/utils";

interface EntityCardProps {
  href: string;
  emoji: string;
  /** Real cover photo path (Location/Container.coverPhotoPath) — when set, renders the actual photo instead of the emoji fallback. */
  coverPhotoPath?: string | null;
  title: string;
  subtitle: string;
  /** Container ID, shown as a flat (no-shadow) pill. */
  badge?: string;
  /** Stable id to hash the badge's pastel color from (e.g. the container id). Falls back to neutral if omitted. */
  badgeKey?: string;
  className?: string;
}

/** Grid card for Locations List / Container children — thumbnail + name + count. */
export function EntityCard({ href, emoji, coverPhotoPath, title, subtitle, badge, badgeKey, className }: EntityCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        // rounded-2xl + border-border, not rounded-xl alone — the
        // radius/border/shadow combo every other card in the app uses
        // (ContainerCard, the Accounts/Recent-transactions/Recurring-bills
        // row lists, ...); this one card type had drifted to a smaller
        // radius with no border, most visible on Location/Container
        // detail's child-entity grid ("Browse") sitting right next to
        // rows that do use the standard combo.
        "flex flex-col overflow-hidden rounded-2xl border border-border bg-white p-3 shadow-sm transition-shadow hover:shadow-lg",
        className
      )}
    >
      {/* aspect-ratio on the wrapper, PhotoThumb absolutely positioned to
          fill it — see container-card.tsx/item-card.tsx's identical fix
          for why a normal-flow percentage-height image can't live
          directly in an aspect-ratio-sized box. */}
      <div className="relative aspect-145/92 w-full overflow-hidden">
        <PhotoThumb emoji={emoji} coverPhotoPath={coverPhotoPath} className="absolute inset-0 size-full" fit="cover" enableLightbox />
        {badge && (
          <span
            className={cn(
              "absolute left-1.5 top-1.5 rounded-full border px-2 py-0.5 text-micro font-semibold",
              badgeKey ? displayCodeBadgeClasses(badgeKey) : "border-border bg-surface-muted text-ink"
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
