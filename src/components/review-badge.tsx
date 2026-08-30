import { cn } from "@/lib/utils";

export function ReviewBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex h-4 min-w-4 items-center justify-center rounded-full bg-ink-fill px-1 text-micro font-medium leading-none text-white",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
