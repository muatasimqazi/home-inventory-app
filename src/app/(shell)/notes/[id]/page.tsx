"use client";

import { useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { ActivityRow } from "@/components/activity-row";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { NoteFormSheet } from "@/components/note-form-sheet";
import { NoteEditor } from "@/components/note-editor";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { daysUntil } from "@/lib/selectors";
import { relativeTime } from "@/lib/format";

export default function NoteDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const notes = useInventoryStore((s) => s.notes);
  const members = useInventoryStore((s) => s.members);
  const activity = useInventoryStore((s) => s.activity);
  const updateNote = useInventoryStore((s) => s.updateNote);
  const trashNote = useInventoryStore((s) => s.trashNote);
  const restoreNote = useInventoryStore((s) => s.restoreNote);
  const permanentlyDeleteNote = useInventoryStore((s) => s.permanentlyDeleteNote);

  const [editOpen, setEditOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const note = notes.find((n) => n.id === params.id);
  if (!note) return notFound();

  const noteActivity = activity.filter((a) => a.entityId === note.id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 pb-6">
      <div className="flex items-center justify-between">
        <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </button>
        {note.status === "active" && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => updateNote(note.id, { pinned: !note.pinned })}
              aria-label={note.pinned ? "Unpin" : "Pin"}
              className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm"
            >
              <Icon name="pinned" size={18} className={note.pinned ? "text-yellow-text" : "text-muted-foreground"} />
            </button>
            <button onClick={() => setEditOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
              <Icon name="edit" size={18} />
            </button>
            <button onClick={() => setTrashConfirmOpen(true)} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm">
              <Icon name="trash" size={18} className="text-danger" />
            </button>
          </div>
        )}
      </div>

      {note.status === "trashed" && (
        <div className="rounded-lg bg-danger/10 px-3 py-2 text-caption text-danger">
          In Trash — {note.permanentlyDeleteAfter ? daysUntil(note.permanentlyDeleteAfter) : 0} days until permanent deletion.
        </div>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          {note.pinned && <Icon name="pinned" size={14} className="shrink-0 text-yellow-text" />}
          <h1 className="min-w-0 flex-1 text-screen-title font-semibold text-ink">{note.title || "Untitled note"}</h1>
        </div>
        <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
          <Icon name={note.isShared ? "users" : "lock"} size={13} />
          <span>{note.isShared ? "Shared with household" : "Personal — only visible to you"}</span>
          <span>·</span>
          <span>Updated {relativeTime(note.updatedAt)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <NoteEditor
          key={`${note.id}:${note.status}`}
          content={note.content}
          editable={false}
          // Checkboxes stay live even in the read view — a shared
          // checklist note (groceries, a household log) should be
          // checkable straight from here, not only from Edit. See
          // note-editor.tsx's onChange doc for how this is wired.
          onChange={note.status === "active" ? (markdown) => updateNote(note.id, { content: markdown }) : undefined}
        />
      </div>

      {note.status === "trashed" && (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" onClick={() => restoreNote(note.id)}>
            <Icon name="restore" size={16} /> Restore
          </Button>
          <Button variant="destructive" size="lg" onClick={() => setDeleteConfirmOpen(true)}>
            <Icon name="trash" size={16} /> Delete Forever
          </Button>
        </div>
      )}

      {noteActivity.length > 0 && (
        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h2 className="text-section-title font-medium text-ink">Activity</h2>
          <div className="divide-y divide-border">
            {noteActivity.map((entry) => (
              <ActivityRow key={entry.id} entry={entry} members={members} />
            ))}
          </div>
        </div>
      )}

      <NoteFormSheet
        key={note.id}
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit note"
        initialTitle={note.title}
        initialContent={note.content}
        initialIsShared={note.isShared}
        onSubmit={({ title, content, isShared }) => {
          updateNote(note.id, { title, content, isShared });
          toast.success("Note updated");
        }}
      />

      <ConfirmDialog
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        tone="default"
        icon="trash"
        title="Move to Trash?"
        description="This note will be recoverable from Trash for 30 days before it's automatically deleted."
        confirmLabel="Move to Trash"
        onConfirm={() => {
          trashNote(note.id);
          toast("Moved to Trash", { description: "Recoverable for 30 days." });
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description="This permanently deletes the note. This cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={() => {
          permanentlyDeleteNote(note.id);
          toast.success("Note permanently deleted");
          router.push("/trash?tab=notes");
        }}
      />
    </div>
  );
}
