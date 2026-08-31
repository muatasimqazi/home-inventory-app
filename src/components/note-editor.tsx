"use client";

import { forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown, type MarkdownStorage } from "tiptap-markdown";
import { Icon, type IconName } from "@/components/icon";
import { cn } from "@/lib/utils";

interface NoteEditorProps {
  /** Raw Markdown — only ever read once, on mount (Markdown extension
   * parses it into the initial doc). Callers that need to swap in a
   * different note's content must remount this component behind a `key`,
   * same convention every other form in this app uses (e.g. notes/[id]/edit/page.tsx keying on note.id). */
  content: string;
  editable: boolean;
  /** Fires with the current Markdown serialization on every real change —
   * both normal typing in edit mode, and (since onReadOnlyChecked below
   * always allows the toggle through) a task-item checkbox flipped while
   * `editable` is false, so a shared checklist note stays useful to check
   * off directly from the read view, not just from Edit. */
  onChange?: (markdown: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

/** Imperative handle so a caller (NoteAssistantBar, via an AI "request a
 * change" response) can replace the document's content as one real,
 * undoable ProseMirror transaction on the *already-mounted* editor — as
 * opposed to remounting this component behind a new `content`/key, which
 * would work but throws away Tiptap's own undo history. That history is
 * the whole safety net for an AI-driven edit: no confirmation dialog, just
 * a normal Ctrl+Z (or the toolbar's Undo button) if it got it wrong. */
export interface NoteEditorHandle {
  setContent: (markdown: string) => void;
}

export const NoteEditor = forwardRef<NoteEditorHandle, NoteEditorProps>(function NoteEditor(
  { content, editable, onChange, placeholder, autoFocus, className },
  ref
) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit.configure({ table: { resizable: false } }),
      TaskList,
      TaskItem.configure({
        nested: true,
        // Without this, task items are immutable whenever `editable` is
        // false — see note-editor.tsx's onChange doc above for why that's
        // deliberately not what we want here.
        onReadOnlyChecked: onChange ? () => true : undefined,
      }),
      // Different default text depending on mode — "Write something…"
      // reads as an instruction, which is wrong to show over a genuinely
      // empty *read-only* note (nothing to type there).
      Placeholder.configure({ placeholder: editable ? (placeholder ?? "Write something…") : "No content." }),
      Markdown.configure({ html: false, transformCopiedText: true, transformPastedText: true }),
    ],
    content,
    editable,
    // Avoids SSR hydration mismatch — this module can be evaluated during
    // Next.js's initial server render pass, where ProseMirror has no DOM
    // to attach to (same reasoning as every other "defer to the client"
    // guard in this app, e.g. desktop-sidebar.tsx's collapsed state).
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap text-body text-ink focus:outline-none",
          // Editable mode gets its own visible box (border/background/
          // padding/min-height) — a Textarea-sized writing surface, not a
          // single line that grows from nothing. Read-only mode stays
          // bare: the caller (notes/[id]/page.tsx) already wraps it in a
          // card, and double-boxing it there looked wrong.
          editable && "min-h-[40vh] rounded-lg border border-border bg-card p-3",
          className
        ),
      },
    },
    onUpdate: ({ editor }) => {
      // tiptap-markdown ships no @tiptap/core Storage augmentation (no
      // `declare module` in its own index.d.ts) — narrow cast via its own
      // exported MarkdownStorage type instead of widening this to `any`.
      const storage = editor.storage as unknown as { markdown: MarkdownStorage };
      onChange?.(storage.markdown.getMarkdown());
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      setContent: (markdown: string) => {
        // A real transaction on the live editor (not a remount) — stays
        // on the undo stack. Markdown extension parses the string the
        // same way it does the initial `content` prop.
        editor?.commands.setContent(markdown, { emitUpdate: true });
      },
    }),
    [editor]
  );

  return (
    <div className="flex flex-col gap-2">
      {editable && editor && <NoteEditorToolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  );
});

function NoteEditorToolbar({ editor }: { editor: Editor }) {
  const chain = () => editor.chain().focus();

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-surface-muted p-1">
      <ToolbarButton icon="bold" label="Bold" active={editor.isActive("bold")} onClick={() => chain().toggleBold().run()} />
      <ToolbarButton icon="italic" label="Italic" active={editor.isActive("italic")} onClick={() => chain().toggleItalic().run()} />
      <ToolbarDivider />
      <ToolbarButton icon="list" label="Bullet list" active={editor.isActive("bulletList")} onClick={() => chain().toggleBulletList().run()} />
      <ToolbarButton
        icon="listOrdered"
        label="Numbered list"
        active={editor.isActive("orderedList")}
        onClick={() => chain().toggleOrderedList().run()}
      />
      <ToolbarButton icon="checkSquare" label="Checklist" active={editor.isActive("taskList")} onClick={() => chain().toggleTaskList().run()} />
      <ToolbarDivider />
      <ToolbarButton
        icon="table"
        label={editor.isActive("table") ? "Delete table" : "Insert table"}
        active={editor.isActive("table")}
        onClick={() =>
          editor.isActive("table") ? chain().deleteTable().run() : chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
        }
      />
      <ToolbarDivider />
      <ToolbarButton icon="undo" label="Undo" onClick={() => chain().undo().run()} />
      <ToolbarButton icon="redo" label="Redo" onClick={() => chain().redo().run()} />
    </div>
  );
}

function ToolbarButton({ icon, label, active, onClick }: { icon: IconName; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "tap-target flex size-8 shrink-0 items-center justify-center rounded-md",
        active ? "bg-ink-fill text-white" : "text-muted-foreground hover:bg-card hover:text-ink"
      )}
    >
      <Icon name={icon} size={16} />
    </button>
  );
}

function ToolbarDivider() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}
