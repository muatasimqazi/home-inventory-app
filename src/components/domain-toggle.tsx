import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

/**
 * One selectable/toggleable domain row (0033_household_domains.sql) —
 * same DomainCard visual language as /more (icon tone, title,
 * description), but a toggle rather than a navigation link. Shared
 * between household-setup's "what do you want to track?" onboarding step
 * and settings/domains' later change-it-anytime page — both are the same
 * underlying choice, just at different points in a household's life.
 */
export function DomainToggle({
  icon,
  tone,
  title,
  description,
  checked,
  onToggle,
  disabled,
}: {
  icon: IconName;
  tone: string;
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
  /** Read-only display (e.g. a non-owner viewing settings/domains) — still shows the current state, just isn't tappable. */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      className={cn(
        "tap-target flex items-center gap-3 rounded-2xl border bg-card p-4 text-left shadow-sm disabled:opacity-70",
        checked ? "border-yellow" : "border-border"
      )}
    >
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-[10px] text-white", tone)}>
        <Icon name={icon} size={22} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{title}</p>
        <p className="truncate text-caption text-muted-foreground">{description}</p>
      </div>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border-2",
          checked ? "border-yellow bg-yellow text-white" : "border-border text-transparent"
        )}
      >
        <Icon name="check" size={13} />
      </span>
    </button>
  );
}
