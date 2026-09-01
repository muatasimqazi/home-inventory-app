"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { taskDueBucket, type TaskDueBucket } from "@/lib/selectors";
import { taskCategoryIcon } from "@/lib/task-category";
import { formatShortDate } from "@/lib/format";
import type { HouseholdTask } from "@/lib/types";
import { cn } from "@/lib/utils";

const BUCKET_LABEL: Record<TaskDueBucket, string> = { overdue: "Overdue", today: "Today", upcoming: "Upcoming" };

/**
 * List page — grouped Overdue / Today / Upcoming rather than a flat
 * sorted list, per docs/Household Hub Addendum.md §5's explicit call for
 * "a genuinely prominent Due Today/Overdue surface, not a buried list."
 * No existing visual precedent for "overdue" in this app to copy
 * (RecurringBills' daysUntil() clamps at 0 — bills never read as overdue
 * today) — this introduces that language for the first time, scoped to
 * Tasks.
 */
export default function TasksPage() {
  const router = useRouter();
  const tasks = useInventoryStore((s) => s.tasks);
  const people = useInventoryStore((s) => s.people);
  const categories = useInventoryStore((s) => s.taskCategories);
  const subtasks = useInventoryStore((s) => s.subtasks);
  const completeTask = useInventoryStore((s) => s.completeTask);
  const [query, setQuery] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

  const visibleTasks = tasks.filter((t) => !t.trashedAt && (showCompleted ? !t.isActive : t.isActive));
  const filtered = query.trim()
    ? visibleTasks.filter((t) => t.title.toLowerCase().includes(query.trim().toLowerCase()) || t.description.toLowerCase().includes(query.trim().toLowerCase()))
    : visibleTasks;

  const groups: Record<TaskDueBucket, HouseholdTask[]> = { overdue: [], today: [], upcoming: [] };
  for (const t of filtered) groups[taskDueBucket(t.dueAt)].push(t);
  for (const bucket of Object.keys(groups) as TaskDueBucket[]) {
    groups[bucket].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  }

  function personName(personId: string | null): string | null {
    if (!personId) return null;
    return people.find((p) => p.id === personId)?.displayName ?? null;
  }

  function categoryName(categoryId: string): string {
    return categories.find((c) => c.id === categoryId)?.name ?? "Other";
  }

  function subtaskProgress(taskId: string): string | null {
    const own = subtasks.filter((s) => s.taskId === taskId);
    if (own.length === 0) return null;
    return `${own.filter((s) => s.isCompleted).length}/${own.length}`;
  }

  return (
    <div className="flex flex-col gap-5 pb-6">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm md:hidden">
        <Icon name="arrowLeft" size={18} />
      </button>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Tasks</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Reminders, maintenance, and appointments.</p>
        </div>
        <Button size="sm" onClick={() => router.push("/tasks/new")}>
          <Icon name="plus" size={16} /> New task
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowCompleted(false)}
          className={cn("tap-target rounded-full border px-3 py-1.5 text-caption font-medium", !showCompleted ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink")}
        >
          Pending
        </button>
        <button
          type="button"
          onClick={() => setShowCompleted(true)}
          className={cn("tap-target rounded-full border px-3 py-1.5 text-caption font-medium", showCompleted ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink")}
        >
          Completed
        </button>
      </div>

      {visibleTasks.length > 0 && <SearchBar value={query} onChange={setQuery} placeholder="Search tasks…" />}

      {visibleTasks.length === 0 ? (
        <EmptyState
          icon="tasks"
          title={showCompleted ? "Nothing completed yet" : "No tasks yet"}
          description={showCompleted ? "Completed tasks and reminders show up here." : "Plant watering, a kid's appointment, anything the household shouldn't forget."}
          action={
            !showCompleted && (
              <Button size="sm" onClick={() => router.push("/tasks/new")}>
                <Icon name="plus" size={16} /> New task
              </Button>
            )
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="search" title={`No tasks match "${query.trim()}"`} description="Check the spelling or try a different word." />
      ) : (
        (["overdue", "today", "upcoming"] as TaskDueBucket[]).map((bucket) =>
          groups[bucket].length === 0 ? null : (
            <div key={bucket} className="flex flex-col gap-2">
              <h2 className={cn("text-caption font-semibold uppercase tracking-wide", bucket === "overdue" ? "text-danger" : "text-muted-foreground")}>
                {BUCKET_LABEL[bucket]} · {groups[bucket].length}
              </h2>
              <div className="flex flex-col gap-2">
                {groups[bucket].map((task) => {
                  const assignee = personName(task.assignedToPersonId);
                  const progress = subtaskProgress(task.id);
                  return (
                    <div key={task.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
                      {!showCompleted && (
                        <button
                          type="button"
                          onClick={() => {
                            completeTask(task.id);
                            toast.success(`Completed "${task.title}"`);
                          }}
                          aria-label="Mark complete"
                          className="tap-target flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-border hover:border-ink-fill"
                        />
                      )}
                      <Link href={`/tasks/${task.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <IconChip icon={taskCategoryIcon(categoryName(task.categoryId))} tone={bucket === "overdue" ? "danger" : "muted"} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-body font-medium text-ink">{task.title}</p>
                          <p className={cn("truncate text-caption", bucket === "overdue" ? "text-danger" : "text-muted-foreground")}>
                            {formatShortDate(task.dueAt)}
                            {task.scheduleType === "recurring" && " · Repeats"}
                            {assignee && ` · ${assignee}`}
                            {progress && ` · ${progress}`}
                          </p>
                        </div>
                        <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )
      )}
    </div>
  );
}
