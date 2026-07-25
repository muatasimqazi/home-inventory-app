import { cn } from "@/lib/utils";

interface PhotoThumbProps {
  emoji: string;
  label?: string;
  className?: string;
  emojiClassName?: string;
}

/**
 * Stand-in for a captured photo — a pale brand-tinted panel + emoji, so the
 * fallback still reads as designed rather than a flat gray placeholder box.
 */
export function PhotoThumb({ emoji, label, className, emojiClassName }: PhotoThumbProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl bg-brand-100",
        className
      )}
    >
      <span className={cn("text-3xl leading-none", emojiClassName)} aria-hidden>
        {emoji}
      </span>
      {label ? <span className="text-caption text-yellow/80">{label}</span> : null}
    </div>
  );
}
