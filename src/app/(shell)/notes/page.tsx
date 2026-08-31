"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { SearchBar } from "@/components/search-bar";
import { NoteFormSheet } from "@/components/note-form-sheet";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { useRemountKey } from "@/hooks/use-remount-key";

/** First non-blank line of the raw Markdown, with the most common syntax
 * markers stripped — good enough for a one-line list snippet without
 * pulling react-markdown into a context it's not rendering into. */
function snippet(content: string): string {
  const line = content.split("\n").find((l) => l.trim().length > 0) ?? "";
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^[-*+]\s+/, "")
    .replace(/^\d+\.\s+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

export default function NotesPage() {
  const router = useRouter();
  const notes = useInventoryStore((s) => s.notes);
  const createNote = useInventoryStore((s) => s.createNote);
  const activeNotes = notes.filter((n) => n.status === "active");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, bumpCreateKey] = useRemountKey();

  function openCreate() {
    bumpCreateKey();
    setCreateOpen(true);
  }

  const filtered = query.trim()
    ? activeNotes.filter((n) => n.title.toLowerCase().includes(query.trim().toLowerCase()) || n.content.toLowerCase().includes(query.trim().toLowerCase()))
    : activeNotes;

  // Pinned first, then most-recently-updated — a single global pin flag
  // (not per-viewer), same simplicity call as everything else in v1.
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  return (
    <div className="flex flex-col gap-5 pb-6">
      <button onClick={() => router.back()} className="tap-target flex size-9 items-center justify-center rounded-full bg-card shadow-sm md:hidden">
        <Icon name="arrowLeft" size={18} />
      </button>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Notes</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Personal or shared with the household.</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Icon name="plus" size={16} /> New note
        </Button>
      </div>

      {activeNotes.length > 0 && <SearchBar value={query} onChange={setQuery} placeholder="Search notes…" />}

      {activeNotes.length === 0 ? (
        <EmptyState
          icon="notebook"
          title="No notes yet"
          description="Jot down a quick list, a household log, anything worth keeping — personal by default, shareable when it's for everyone."
          action={
            <Button size="sm" onClick={openCreate}>
              <Icon name="plus" size={16} /> New note
            </Button>
          }
        />
      ) : sorted.length === 0 ? (
        <EmptyState icon="search" title={`No notes match "${query.trim()}"`} description="Check the spelling or try a different word." />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((note) => (
            <Link key={note.id} href={`/notes/${note.id}`} className="tap-target flex items-start gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-100">
                <Icon name="notebook" size={16} className="text-yellow" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {note.pinned && <Icon name="pinned" size={12} className="shrink-0 text-muted-foreground" />}
                  <p className="min-w-0 flex-1 truncate text-body font-medium text-ink">{note.title || "Untitled note"}</p>
                </div>
                {snippet(note.content) && <p className="truncate text-caption text-muted-foreground">{snippet(note.content)}</p>}
              </div>
              <span title={note.isShared ? "Shared with household" : "Personal"} className="shrink-0 pt-0.5 text-muted-foreground">
                <Icon name={note.isShared ? "users" : "lock"} size={14} />
              </span>
              <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}

      <NoteFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="New note"
        onSubmit={({ title, content, isShared }) => {
          const created = createNote({ title, content, isShared });
          router.push(`/notes/${created.id}`);
        }}
      />
    </div>
  );
}
