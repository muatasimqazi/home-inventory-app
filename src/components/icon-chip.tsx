import { cn } from "@/lib/utils";
import { Icon, type IconName } from "@/components/icon";

interface IconChipProps {
  icon: IconName;
  className?: string;
  tone?: "yellow" | "ink" | "muted" | "danger";
  size?: "sm" | "md";
}

const TONES: Record<NonNullable<IconChipProps["tone"]>, string> = {
  yellow: "bg-yellow text-white",
  ink: "bg-ink text-white",
  muted: "bg-surface-muted text-ink",
  danger: "bg-danger/10 text-danger",
};

const SIZES: Record<NonNullable<IconChipProps["size"]>, { box: string; icon: number }> = {
  sm: { box: "size-8", icon: 16 },
  md: { box: "size-9", icon: 18 },
};

export function IconChip({ icon, className, tone = "yellow", size = "md" }: IconChipProps) {
  const { box, icon: iconSize } = SIZES[size];
  return (
    <div className={cn("flex shrink-0 items-center justify-center rounded-[10px]", box, TONES[tone], className)}>
      <Icon name={icon} size={iconSize} />
    </div>
  );
}
