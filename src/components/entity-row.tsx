import Link from "next/link";
import { IconChip } from "@/components/icon-chip";
import { Icon, type IconName } from "@/components/icon";
import { PhotoThumb } from "@/components/photo-thumb";
import { cn } from "@/lib/utils";

interface EntityRowProps {
  href: string;
  icon: IconName;
  /** Real cover photo (Location/Container.coverPhotoEmoji/coverPhotoPath) — when given, renders a real thumbnail instead of the generic icon chip. */
  emoji?: string;
  coverPhotoPath?: string | null;
  title: string;
  subtitle: string;
  className?: string;
}

/** Location/Container row — real photo thumbnail when available (falling back to a generic icon chip), name + count, chevron. */
export function EntityRow({ href, icon, emoji, coverPhotoPath, title, subtitle, className }: EntityRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "tap-target flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted",
        className
      )}
    >
      {emoji ? (
        <PhotoThumb emoji={emoji} coverPhotoPath={coverPhotoPath} className="size-10 shrink-0" emojiClassName="text-xl" />
      ) : (
        <IconChip icon={icon} tone="yellow" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
