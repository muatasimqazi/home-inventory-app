"use client";

import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { NoteEditor } from "@/components/note-editor";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";

interface NoteFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialTitle?: string;
  initialContent?: string;
  initialIsShared?: boolean;
  onSubmit: (values: { title: string; content: string; isShared: boolean }) => void;
}

/**
 * Shared Create/Edit sheet for Note — title + a real WYSIWYG body
 * (NoteEditor, Tiptap-backed) + the personal/shared toggle. Content is
 * still stored/exchanged as Markdown under the hood (see NoteEditor) so
 * nothing about the schema, search, or the list page's snippet preview
 * had to change when this moved off a plain Textarea. Mirrors
 * EntityFormSheet's structure (same remount-via-key contract: callers
 * editing an existing note must mount this behind a `key` tied to the
 * note id, same as locations/[id] does for EntityFormSheet, or edits to a
 * second note after the first will start from the first note's stale
 * initial values).
 */
export function NoteFormSheet({ open, onOpenChange, title, initialTitle = "", initialContent = "", initialIsShared = false, onSubmit }: NoteFormSheetProps) {
  const [noteTitle, setNoteTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isShared, setIsShared] = useState(initialIsShared);
  const [error, setError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(titleInputRef, [open]);

  function handleSubmit() {
    if (!noteTitle.trim() && !content.trim()) {
      setError("Add a title or some content.");
      return;
    }
    onSubmit({ title: noteTitle.trim(), content, isShared });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{title}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Title</label>
            <Input
              ref={titleInputRef}
              value={noteTitle}
              onChange={(e) => {
                setNoteTitle(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Untitled note"
              className="h-11"
            />
          </div>
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Content</label>
            <NoteEditor
              content={content}
              editable
              onChange={(markdown) => {
                setContent(markdown);
                if (error) setError(null);
              }}
              placeholder="Pick up dry cleaning, vet appointment Thursday 3pm…"
            />
            {error && <p className="mt-1 text-caption text-danger">{error}</p>}
          </div>
          <label className="flex items-start gap-2 text-caption text-ink">
            <Checkbox checked={isShared} onCheckedChange={(v) => setIsShared(v === true)} className="mt-0.5" />
            <span>
              Share with household
              <span className="block text-micro text-muted-foreground">Others can see and edit this note. Off by default — a personal note stays visible only to you.</span>
            </span>
          </label>
          <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
