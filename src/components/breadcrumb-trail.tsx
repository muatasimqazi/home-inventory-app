import Link from "next/link";
import { Icon } from "@/components/icon";
import type { BreadcrumbSegment } from "@/lib/selectors";
import { cn } from "@/lib/utils";

export function BreadcrumbTrail({
  segments,
  className,
  interactive = true,
}: {
  segments: BreadcrumbSegment[];
  className?: string;
  interactive?: boolean;
}) {
  if (segments.length === 0) {
    return <span className={cn("text-caption text-muted-foreground", className)}>Unfiled</span>;
  }

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1 text-caption text-muted-foreground", className)}>
      {segments.map((seg, i) => (
        <span key={seg.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && <Icon name="chevronRight" size={12} className="shrink-0" />}
          {interactive ? (
            <Link href={seg.href} className="truncate hover:text-ink hover:underline">
              {seg.name}
            </Link>
          ) : (
            <span className="truncate">{seg.name}</span>
          )}
        </span>
      ))}
    </div>
  );
}
