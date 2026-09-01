"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { NoteEditor, type NoteEditorHandle } from "@/components/note-editor";
import { NoteAssistantBar } from "@/components/note-assistant-bar";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

/**
 * Full-page create flow — same "standalone takeover, no shell chrome"
 * pattern as src/app/add/page.tsx and items/[id]/edit/page.tsx (both live
 * outside the (shell) route group for the same reason: focused, no
 * sidebar/bottom-nav competing for space while typing a note). Replaced
 * the original bottom-sheet NoteFormSheet at the user's request — a real
 * WYSIWYG editor with a toolbar wants more room than a sheet gives it.
 */
export default function NewNotePage() {
  const router = useRouter();
  const createNote = useInventoryStore((s) => s.createNote);
  const keyboardInset = useKeyboardInset();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<NoteEditorHandle>(null);
  useAutoFocusVisible(titleInputRef, []);

  function handleSave() {
    if (!title.trim() && !content.trim()) {
      setError("Add a title or some content.");
      return;
    }
    setSaving(true);
    const created = createNote({ title: title.trim(), content, isShared });
    // ?new=1 — router.replace() swaps this page's own history entry for
    // the detail page's, but the detail page's back button still needs to
    // know it just replaced a create form rather than a normal browsing
    // step, so it can send "back" to a clean list instead of wherever
    // history.back() would otherwise resolve to. See notes/[id]/page.tsx.
    router.replace(`/notes/${created.id}?new=1`);
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
          <h1 className="text-body font-semibold text-ink">New note</h1>
          <p className="text-micro text-muted-foreground">Personal by default — share it below if it&rsquo;s for everyone.</p>
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
            autoFocus={false}
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
        <Button size="lg" className="w-full bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSave} disabled={saving}>
          {saving ? <Icon name="spinner" size={16} className="animate-spin" /> : "Save note"}
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
