import type { IconName } from "@/components/icon";

// The 5 seeded system defaults (0053_task_categories_and_subtasks.sql)
// get a specific icon each; anything else — a household's own custom
// category — falls back to the generic "tasks" icon. No per-category
// color/icon picker UI in v1 (matches this domain's existing "keep it
// simple" scope calls) — every row's actual color cue is its due-bucket
// (overdue/today/upcoming), not its category.
const DEFAULT_CATEGORY_ICON: Record<string, IconName> = {
  maintenance: "hammer",
  appointment: "calendar",
  chore: "checkSquare",
  grocery: "grocery",
  other: "tasks",
};

export function taskCategoryIcon(name: string): IconName {
  return DEFAULT_CATEGORY_ICON[name.toLowerCase()] ?? "tasks";
}
