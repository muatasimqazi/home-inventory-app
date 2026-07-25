import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

/** Illustrated (icon + copy + action), never a bare caption — PRD §3/§10.4. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 rounded-xl bg-white px-6 py-12 text-center", className)}>
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-muted">
        <Icon name={icon} size={26} className="text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-item-title font-medium text-ink">{title}</p>
        {description ? <p className="text-body text-muted-foreground max-w-xs">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
