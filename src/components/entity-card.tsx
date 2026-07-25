import Link from "next/link";
import { PhotoThumb } from "@/components/photo-thumb";
import { cn } from "@/lib/utils";

interface EntityCardProps {
  href: string;
  emoji: string;
  title: string;
  subtitle: string;
  /** Container Bin ID, shown as a flat (no-shadow) chip. */
  badge?: string;
  className?: string;
}

/** Grid card for Locations List / Container children — thumbnail + name + count. */
export function EntityCard({ href, emoji, title, subtitle, badge, className }: EntityCardProps) {
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
          <span className="absolute left-1.5 top-1.5 rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-micro text-ink">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-item-title font-medium text-ink">{title}</p>
      <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
    </Link>
  );
}
