import { cn } from "@/lib/utils";

interface PhotoThumbProps {
  emoji: string;
  label?: string;
  className?: string;
  emojiClassName?: string;
}

/**
 * Stand-in for a captured photo. Mirrors the Figma mocks' own
 * "IntentionalThumbnail" placeholder pattern (a muted box + glyph + label)
 * rather than inventing a different empty-photo treatment.
 */
export function PhotoThumb({ emoji, label, className, emojiClassName }: PhotoThumbProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 rounded-md bg-[#d9dbd8] overflow-hidden",
        className
      )}
    >
      <span className={cn("text-3xl leading-none", emojiClassName)} aria-hidden>
        {emoji}
      </span>
      {label ? <span className="text-caption text-ink/70">{label}</span> : null}
    </div>
  );
}
