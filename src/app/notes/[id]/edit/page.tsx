"use client";

import { useRef, useState } from "react";
import { notFound, useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { NoteEditor, type NoteEditorHandle } from "@/components/note-editor";
import { NoteAssistantBar } from "@/components/note-assistant-bar";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";

/** Full-page edit flow — see notes/new/page.tsx's header comment for why
 * this lives outside the (shell) route group. */
export default function EditNotePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const notes = useInventoryStore((s) => s.notes);
  const updateNote = useInventoryStore((s) => s.updateNote);
  const keyboardInset = useKeyboardInset();

  const note = notes.find((n) => n.id === params.id);
  if (!note) return notFound();

  return <EditNoteForm key={note.id} note={note} updateNote={updateNote} keyboardInset={keyboardInset} onDone={() => router.push(`/notes/${note.id}`)} />;
}

function EditNoteForm({
  note,
  updateNote,
  keyboardInset,
  onDone,
}: {
  note: { id: string; title: string; content: string; isShared: boolean };
  updateNote: (noteId: string, patch: { title: string; content: string; isShared: boolean }) => void;
  keyboardInset: number;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [isShared, setIsShared] = useState(note.isShared);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<NoteEditorHandle>(null);

  function handleSave() {
    if (!title.trim() && !content.trim()) {
      setError("Add a title or some content.");
      return;
    }
    updateNote(note.id, { title: title.trim(), content, isShared });
    toast.success("Note updated");
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
        <h1 className="text-body font-semibold text-ink">Edit note</h1>
      </header>

      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-4">
        <Field label="Title">
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Untitled note"
            className="h-11"
          />
        </Field>

        <Field label="Content">
          <NoteEditor
            ref={editorRef}
            content={content}
            editable
            onChange={(markdown) => {
              setContent(markdown);
              if (error) setError(null);
            }}
            placeholder="Pick up dry cleaning, vet appointment Thursday 3pm…"
          />
          {error && <p className="mt-1 text-caption text-danger">{error}</p>}
        </Field>

        <NoteAssistantBar title={title} content={content} onApplyEdit={(markdown) => editorRef.current?.setContent(markdown)} />

        <label className="flex items-start gap-2 text-caption text-ink">
          <Checkbox checked={isShared} onCheckedChange={(v) => setIsShared(v === true)} className="mt-0.5" />
          <span>
            Share with household
            <span className="block text-micro text-muted-foreground">Others can see and edit this note. Off by default — a personal note stays visible only to you.</span>
          </span>
        </label>
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
