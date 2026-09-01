"use client";

import { useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { ActivityRow } from "@/components/activity-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { taskDueBucket, daysUntil } from "@/lib/selectors";
import { formatShortDate, relativeTime } from "@/lib/format";
import type { TaskCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

const CATEGORY_META: Record<TaskCategory, { icon: IconName; label: string }> = {
  maintenance: { icon: "hammer", label: "Maintenance" },
  appointment: { icon: "calendar", label: "Appointment" },
  chore: { icon: "checkSquare", label: "Chore" },
  other: { icon: "tasks", label: "Other" },
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tasks = useInventoryStore((s) => s.tasks);
  const people = useInventoryStore((s) => s.people);
  const members = useInventoryStore((s) => s.members);
  const activity = useInventoryStore((s) => s.activity);
  const taskCompletions = useInventoryStore((s) => s.taskCompletions);
  const completeTask = useInventoryStore((s) => s.completeTask);
  const trashTask = useInventoryStore((s) => s.trashTask);
  const restoreTask = useInventoryStore((s) => s.restoreTask);
  const permanentlyDeleteTask = useInventoryStore((s) => s.permanentlyDeleteTask);

  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const task = tasks.find((t) => t.id === params.id);
  if (!task) return notFound();

  const bucket = taskDueBucket(task.dueAt);
  const meta = CATEGORY_META[task.category];
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
        <IconChip icon={meta.icon} tone={bucket === "overdue" && task.isActive ? "danger" : "yellow"} />
        <div className="min-w-0 flex-1">
          <h1 className="text-screen-title font-semibold text-ink">{task.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-caption text-muted-foreground">
            <span>{meta.label}</span>
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
            {!task.isActive && (
              <>
                <span>·</span>
                <span className="font-medium text-badge-green-text">Completed</span>
              </>
            )}
          </div>
        </div>
      </div>

      {task.description && <p className="text-body text-ink">{task.description}</p>}

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
          <h2 className="text-section-title font-medium text-ink">Completion history</h2>
          <div className="flex flex-col divide-y divide-border">
            {completions.map((c) => (
              <p key={c.id} className="py-2 text-caption text-muted-foreground">
                Completed {relativeTime(c.completedAt)} by {members.find((m) => m.userId === c.completedByUserId)?.displayName ?? "someone"}
              </p>
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
