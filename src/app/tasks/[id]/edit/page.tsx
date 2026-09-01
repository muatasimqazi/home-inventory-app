"use client";

import { useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskCategorySelect } from "@/components/task-category-select";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import type { HouseholdTask, Person, TaskScheduleType } from "@/lib/types";

const UNASSIGNED_VALUE = "unassigned";

/** local YYYY-MM-DDTHH:mm for a datetime-local input's value — see
 * tasks/new/page.tsx's defaultDueLocal() for why a naive UTC slice would
 * show the wrong wall-clock time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Full-page edit flow — see tasks/new/page.tsx's header comment for why
 * this lives outside the (shell) route group. */
export default function EditTaskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tasks = useInventoryStore((s) => s.tasks);
  const people = useInventoryStore((s) => s.people);
  const updateTask = useInventoryStore((s) => s.updateTask);
  const keyboardInset = useKeyboardInset();

  const task = tasks.find((t) => t.id === params.id);
  if (!task) return notFound();

  return (
    <EditTaskForm
      key={task.id}
      task={task}
      people={people}
      updateTask={updateTask}
      keyboardInset={keyboardInset}
      onDone={() => router.push(`/tasks/${task.id}`)}
    />
  );
}

function EditTaskForm({
  task,
  people,
  updateTask,
  keyboardInset,
  onDone,
}: {
  task: HouseholdTask;
  people: Person[];
  updateTask: (taskId: string, patch: Partial<HouseholdTask>) => void;
  keyboardInset: number;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [categoryId, setCategoryId] = useState(task.categoryId);
  const [scheduleType, setScheduleType] = useState<TaskScheduleType>(task.scheduleType);
  const [dueLocal, setDueLocal] = useState(() => toLocalInput(task.dueAt));
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(task.recurrenceRule?.interval ?? 7));
  const [assignedToPersonId, setAssignedToPersonId] = useState(task.assignedToPersonId ?? UNASSIGNED_VALUE);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!title.trim()) {
      setError("Give the task a title.");
      return;
    }
    if (!dueLocal) {
      setError("Set a due date.");
      return;
    }
    const interval = Math.max(1, Math.min(365, Number(recurrenceInterval) || 1));
    updateTask(task.id, {
      title: title.trim(),
      description: description.trim(),
      categoryId,
      scheduleType,
      dueAt: new Date(dueLocal).toISOString(),
      recurrenceRule: scheduleType === "recurring" ? { freq: "days", interval } : null,
      assignedToPersonId: assignedToPersonId === UNASSIGNED_VALUE ? null : assignedToPersonId,
    });
    toast.success("Task updated");
    onDone();
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onDone}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="text-body font-semibold text-ink">Edit task</h1>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Water the fiddle-leaf fig"
            className="h-11"
          />
        </Field>

        <Field label="Description (optional)">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </Field>

        <Field label="Category">
          <TaskCategorySelect value={categoryId} onChange={setCategoryId} />
        </Field>

        <Field label="Assign to (optional)">
          <Select value={assignedToPersonId} onValueChange={setAssignedToPersonId}>
            <SelectTrigger className="h-11 w-full bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED_VALUE}>Unassigned</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Due">
          <Input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => {
              setDueLocal(e.target.value);
              if (error) setError(null);
            }}
            className="h-11"
          />
        </Field>

        <div className="flex gap-2">
          <ScheduleToggle label="One-time" active={scheduleType === "one_time"} onClick={() => setScheduleType("one_time")} />
          <ScheduleToggle label="Repeats" active={scheduleType === "recurring"} onClick={() => setScheduleType("recurring")} />
        </div>

        {scheduleType === "recurring" && (
          <Field label="Repeat every (days)">
            <Input
              type="number"
              min={1}
              max={365}
              value={recurrenceInterval}
              onChange={(e) => setRecurrenceInterval(e.target.value)}
              className="h-11 w-28"
            />
          </Field>
        )}

        {error && <p className="text-caption text-danger">{error}</p>}
      </div>

      <div className="sticky bottom-0 border-t border-border bg-card px-4 py-3" style={{ bottom: keyboardInset }}>
        <Button size="lg" className="w-full bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSave}>
          Save
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-caption text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function ScheduleToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap-target flex-1 rounded-lg border px-4 py-2.5 text-caption font-medium ${active ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink"}`}
    >
      {label}
    </button>
  );
}
