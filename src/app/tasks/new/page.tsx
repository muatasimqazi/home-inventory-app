"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TaskCategorySelect } from "@/components/task-category-select";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import type { TaskScheduleType } from "@/lib/types";

const UNASSIGNED_VALUE = "unassigned";

/** datetime-local wants local YYYY-MM-DDTHH:mm, not UTC ISO — a naive
 * .toISOString().slice(0,16) would show the wrong wall-clock time to
 * anyone not in UTC. Defaults one hour out, rounded to a clean 5-minute
 * mark. */
function defaultDueLocal(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Full-page create flow — see notes/new/page.tsx's header comment for
 * why this lives outside the (shell) route group. */
export default function NewTaskPage() {
  const router = useRouter();
  const people = useInventoryStore((s) => s.people);
  const categories = useInventoryStore((s) => s.taskCategories);
  const createTask = useInventoryStore((s) => s.createTask);
  const keyboardInset = useKeyboardInset();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [scheduleType, setScheduleType] = useState<TaskScheduleType>("one_time");
  const [dueLocal, setDueLocal] = useState(defaultDueLocal);
  const [recurrenceInterval, setRecurrenceInterval] = useState("7");
  const [assignedToPersonId, setAssignedToPersonId] = useState(UNASSIGNED_VALUE);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(titleInputRef, []);

  // Categories load asynchronously (hydration) — default to the seeded
  // "Other" once they're in, rather than blocking the form on them.
  // queueMicrotask defers the setState out of the effect body itself —
  // same "reconcile from an external source on mount" pattern
  // desktop-sidebar.tsx's own collapsed-state effect already uses.
  useEffect(() => {
    if (categoryId || categories.length === 0) return;
    queueMicrotask(() => {
      const other = categories.find((c) => c.isDefault && c.name === "Other");
      setCategoryId(other?.id ?? categories[0].id);
    });
  }, [categories, categoryId]);

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
    setSaving(true);
    const created = createTask({
      title: title.trim(),
      description: description.trim(),
      categoryId,
      scheduleType,
      dueAt: new Date(dueLocal).toISOString(),
      recurrenceRule: scheduleType === "recurring" ? { freq: "days", interval } : null,
      assignedToPersonId: assignedToPersonId === UNASSIGNED_VALUE ? null : assignedToPersonId,
    });
    router.replace(`/tasks/${created.id}`);
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-card px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={() => router.back()}
          className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-muted"
          aria-label="Cancel"
        >
          <Icon name="arrowLeft" size={18} />
        </button>
        <div>
          <h1 className="text-body font-semibold text-ink">New task</h1>
          <p className="text-micro text-muted-foreground">A reminder, chore, or appointment.</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <Field label="Title">
          <Input
            ref={titleInputRef}
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
        <Button size="lg" className="w-full bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSave} disabled={saving}>
          {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save task"}
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
