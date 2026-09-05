"use client";

import { useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { ActivityRow } from "@/components/activity-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventoryStore } from "@/lib/store";
import { taskDueBucket, daysUntil, type TaskDueBucket } from "@/lib/selectors";
import { taskCategoryIcon } from "@/lib/task-category";
import { formatShortDate, relativeTime } from "@/lib/format";
import type { HouseholdTask } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The task's own current lifecycle state, surfaced as one prominent pill next to its title — previously just an easy-to-miss "· Completed" tacked onto the meta line, with no equivalent treatment at all for overdue/due-today/upcoming. Same tone tokens the Tasks list page (bucket headers) and Overview's ActionChip already use for these exact states, so "Overdue" reads the same color everywhere it appears. */
function taskStatus(task: HouseholdTask, bucket: TaskDueBucket): { label: string; className: string } {
  if (!task.isActive) return { label: "Completed", className: "bg-badge-green-bg text-badge-green-text" };
  if (bucket === "overdue") return { label: "Overdue", className: "bg-danger/10 text-danger" };
  if (bucket === "today") return { label: "Due today", className: "bg-badge-orange-bg text-badge-orange-text" };
  return { label: "Upcoming", className: "bg-surface-muted text-ink" };
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tasks = useInventoryStore((s) => s.tasks);
  const people = useInventoryStore((s) => s.people);
  const members = useInventoryStore((s) => s.members);
  const activity = useInventoryStore((s) => s.activity);
  const taskCompletions = useInventoryStore((s) => s.taskCompletions);
  const categories = useInventoryStore((s) => s.taskCategories);
  const completeTask = useInventoryStore((s) => s.completeTask);
  const uncompleteTask = useInventoryStore((s) => s.uncompleteTask);
  const trashTask = useInventoryStore((s) => s.trashTask);
  const restoreTask = useInventoryStore((s) => s.restoreTask);
  const permanentlyDeleteTask = useInventoryStore((s) => s.permanentlyDeleteTask);

  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const task = tasks.find((t) => t.id === params.id);
  if (!task) return notFound();

  const bucket = taskDueBucket(task.dueAt);
  const status = taskStatus(task, bucket);
  const categoryName = categories.find((c) => c.id === task.categoryId)?.name ?? "Other";
  const assignee = task.assignedToPersonId ? people.find((p) => p.id === task.assignedToPersonId) : null;
  const taskActivity = activity.filter((a) => a.entityId === task.id);
  const completions = taskCompletions.filter((c) => c.taskId === task.id).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const isTrashed = !!task.trashedAt;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        {!isTrashed && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push(`/tasks/${task.id}/edit`)}
              className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm"
            >
              <Icon name="edit" size={18} />
            </button>
            <button onClick={() => setTrashConfirmOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
              <Icon name="trash" size={18} className="text-danger" />
            </button>
          </div>
        )}
      </div>

      {isTrashed && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-caption text-danger">
          In Trash — {task.permanentlyDeleteAfter ? daysUntil(task.permanentlyDeleteAfter) : 0} days until permanent deletion.
        </div>
      )}

      <div className="flex items-start gap-3">
        <IconChip icon={taskCategoryIcon(categoryName)} tone={bucket === "overdue" && task.isActive ? "danger" : "yellow"} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-screen-title font-semibold text-ink">{task.title}</h1>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-micro font-semibold", status.className)}>{status.label}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-muted-foreground">
            <span>{categoryName}</span>
            <span>·</span>
            <span className={cn(bucket === "overdue" && task.isActive && "font-medium text-danger")}>
              {task.isActive ? "Due" : "Was due"} {formatShortDate(task.dueAt)}
            </span>
            {task.scheduleType === "recurring" && task.recurrenceRule && (
              <>
                <span>·</span>
                <span>Every {task.recurrenceRule.interval} day{task.recurrenceRule.interval === 1 ? "" : "s"}</span>
              </>
            )}
            {assignee && (
              <>
                <span>·</span>
                <span>{assignee.displayName}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {task.description && <p className="text-body text-ink">{task.description}</p>}

      {!isTrashed && <SubtasksSection taskId={task.id} />}

      {!isTrashed && task.isActive && (
        <Button
          size="lg"
          className="bg-ink-fill text-white hover:bg-ink-fill/90"
          onClick={() => {
            completeTask(task.id);
            toast.success(`Completed "${task.title}"`);
            if (task.scheduleType === "one_time") router.back();
          }}
        >
          <Icon name="check" size={16} /> Mark complete
        </Button>
      )}

      {/* One-time only — a recurring task's own "undo" lives next to its
          most recent entry in Completion History below instead (marking
          it "not done" here would be ambiguous about *which* occurrence,
          since isActive stays true for a recurring task regardless). */}
      {!isTrashed && !task.isActive && task.scheduleType === "one_time" && (
        <Button size="lg" variant="outline" onClick={() => uncompleteTask(task.id)}>
          <Icon name="restore" size={16} /> Mark as not done
        </Button>
      )}

      {isTrashed && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => restoreTask(task.id)}>
            <Icon name="restore" size={16} /> Restore
          </Button>
          <Button variant="destructive" size="lg" onClick={() => setDeleteConfirmOpen(true)}>
            <Icon name="trash" size={16} /> Delete Forever
          </Button>
        </div>
      )}

      {completions.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-section-title font-medium text-ink">Completion history</h2>
            <span className="text-caption text-muted-foreground">
              {completions.length} time{completions.length === 1 ? "" : "s"}
            </span>
          </div>
          {/* Each occurrence's own due date, not just when it was actually
              completed — for a recurring task this is what actually
              distinguishes one finished occurrence from the next
              (completedAt alone doesn't say which cycle it closed out). */}
          <div className="flex flex-col divide-y divide-border">
            {completions.map((c, i) => (
              <div key={c.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-caption text-ink">
                    Done {relativeTime(c.completedAt)} by {members.find((m) => m.userId === c.completedByUserId)?.displayName ?? "someone"}
                  </p>
                  <p className="text-micro text-muted-foreground">
                    Was due {formatShortDate(c.dueAt)}
                    {c.notes && ` · ${c.notes}`}
                  </p>
                </div>
                {/* Recurring only, and only the most recent entry (i === 0,
                    completions are sorted newest-first above) — a one-time
                    task's equivalent undo is the "Mark as not done" button
                    up top; undoing an older recurring entry while newer
                    ones exist would leave dueAt pointing somewhere that no
                    longer matches the actual completion log. */}
                {!isTrashed && i === 0 && task.scheduleType === "recurring" && (
                  <button
                    type="button"
                    onClick={() => uncompleteTask(task.id)}
                    className="shrink-0 text-caption font-semibold text-ink underline underline-offset-2"
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {taskActivity.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-section-title font-medium text-ink">Activity</h2>
          <div className="divide-y divide-border">
            {taskActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} members={members} />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        tone="default"
        icon="trash"
        title="Move to Trash?"
        description="This task will be recoverable from Trash for 30 days before it's automatically deleted."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          trashTask(task.id);
          toast("Moved to Trash", { description: "Recoverable for 30 days." });
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description="This permanently deletes the task and its completion history. This cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={() => {
          permanentlyDeleteTask(task.id);
          toast.success("Task permanently deleted");
          router.push("/trash?tab=tasks");
        }}
      />
    </div>
  );
}

/**
 * A real checklist inside the task — the "checklist" half of the
 * original ask (0053_task_categories_and_subtasks.sql). No trash
 * lifecycle: unchecking/deleting a subtask is a plain, immediate,
 * low-stakes edit, same "just delete" precedent as Favorite.
 *
 * Collapsible (same hand-rolled chevron-toggle pattern location-tree.tsx's
 * LocationAccordionRow already uses — no dedicated Accordion primitive
 * exists in this app) so a task with a long checklist doesn't force
 * everything below it (completion history, activity) further down the
 * page than necessary once the list has already been worked through.
 * Starts open — unlike LocationAccordionRow's many-siblings list (where
 * collapsed-by-default keeps a long list of locations scannable), this is
 * the one subtask section on this one task's own page, so there's no
 * "too many open at once" problem to default around.
 */
function SubtasksSection({ taskId }: { taskId: string }) {
  const subtasks = useInventoryStore((s) => s.subtasks);
  const createSubtask = useInventoryStore((s) => s.createSubtask);
  const toggleSubtask = useInventoryStore((s) => s.toggleSubtask);
  const deleteSubtask = useInventoryStore((s) => s.deleteSubtask);
  const [newTitle, setNewTitle] = useState("");
  const [open, setOpen] = useState(true);

  const own = subtasks.filter((s) => s.taskId === taskId).sort((a, b) => a.position - b.position);

  function handleAdd() {
    const title = newTitle.trim();
    if (!title) return;
    createSubtask(taskId, title);
    setNewTitle("");
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button type="button" onClick={() => setOpen((o) => !o)} className="tap-target flex items-center justify-between gap-2 text-left">
        <h2 className="text-section-title font-medium text-ink">
          Subtasks{own.length > 0 && ` · ${own.filter((s) => s.isCompleted).length}/${own.length}`}
        </h2>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={16} className="shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <>
          {own.length > 0 && (
            <div className="flex flex-col divide-y divide-border">
              {own.map((s) => (
                <div key={s.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSubtask(s.id)}
                    aria-label={s.isCompleted ? "Mark not done" : "Mark done"}
                    className={cn(
                      "tap-target flex size-6 shrink-0 items-center justify-center rounded-full border-2",
                      s.isCompleted ? "border-ink-fill bg-ink-fill text-white" : "border-border"
                    )}
                  >
                    {s.isCompleted && <Icon name="check" size={12} />}
                  </button>
                  <p className={cn("min-w-0 flex-1 text-body", s.isCompleted ? "text-muted-foreground line-through" : "text-ink")}>{s.title}</p>
                  <button
                    type="button"
                    onClick={() => deleteSubtask(s.id)}
                    aria-label="Remove subtask"
                    className="tap-target flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-danger"
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="Add a subtask…"
              className="h-9 flex-1"
            />
            <Button size="sm" variant="secondary" onClick={handleAdd} disabled={!newTitle.trim()}>
              <Icon name="plus" size={14} />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
