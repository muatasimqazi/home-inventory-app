import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

/** Grid/list toggle for bins & items (docs/bugs.md #12) — session-only, not persisted, consistent with the rest of the app's UI state. */
export function ViewToggle({ mode, onChange }: { mode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border bg-white p-0.5">
      {(["grid", "list"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-label={m === "grid" ? "Grid view" : "List view"}
          aria-pressed={mode === m}
          className={cn(
            "tap-target flex size-8 items-center justify-center rounded-md",
            mode === m ? "bg-brand-100 text-yellow" : "text-muted-foreground"
          )}
        >
          <Icon name={m} size={16} />
        </button>
      ))}
    </div>
  );
}
