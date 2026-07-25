import Link from "next/link";
import { IconChip } from "@/components/icon-chip";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

interface EntityRowProps {
  href: string;
  icon: IconName;
  title: string;
  subtitle: string;
  className?: string;
}

/** Location/Container row — icon chip, name + count, chevron. */
export function EntityRow({ href, icon, title, subtitle, className }: EntityRowProps) {
  return (
    <Link
      href={href}
      className={cn(
        "tap-target flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-surface-muted",
        className
      )}
    >
      <IconChip icon={icon} tone="yellow" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body text-ink">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{subtitle}</p>
      </div>
      <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}
