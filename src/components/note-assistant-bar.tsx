"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { NoteAssistTurn } from "@/lib/ask/note-assist";

interface NoteAssistantBarProps {
  title: string;
  content: string;
  /** Applies an "edit"-type AI response — the caller wires this to the
   * live editor's imperative setContent (NoteEditorHandle), not to a
   * remount, so the change lands as one normal, undoable transaction.
   * Ctrl+Z (or the toolbar's Undo button, always visible alongside this
   * bar since it only ever renders in editable contexts) is the entire
   * recovery story for a bad AI edit — no separate confirmation step,
   * same "reversible, low blast radius" calibration as any other
   * single-document edit in this app. */
  onApplyEdit: (markdown: string) => void;
}

/**
 * "Ask about this note or request a change…" — docked at the bottom of
 * the editable Notes editor (notes/new, notes/[id]/edit), not the
 * floating global Ask widget (ask-fab.tsx). Deliberately separate: that
 * one answers questions about the household's finances/inventory via
 * tool-calling against Supabase; this one only ever sees the one note's
 * own content and either answers a question about it or rewrites it — no
 * household data, no tools, no persisted thread (session-local history
 * only, cleared on remount same as the rest of this form).
 */
export function NoteAssistantBar({ title, content, onApplyEdit }: NoteAssistantBarProps) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [history, setHistory] = useState<NoteAssistTurn[]>([]);
  const [lastAnswer, setLastAnswer] = useState<string | null>(null);

  async function submit(message: string) {
    setInput("");
    setLastAnswer(null);
    setPending(true);
    try {
      const res = await fetch("/api/v1/notes/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, message, history }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't process that.");

      if (data.type === "edit") {
        onApplyEdit(data.content);
        toast.success(data.message, { description: "Undo in the toolbar if that's not what you wanted." });
      } else {
        setLastAnswer(data.message);
      }
      setHistory((h) => [...h, { role: "user", content: message }, { role: "assistant", content: data.message }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't process that. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {lastAnswer && (
        <div className="flex items-start gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-caption text-ink shadow-sm">
          <Icon name="ai" size={14} className="mt-0.5 shrink-0 text-yellow" />
          <p className="min-w-0 flex-1">{lastAnswer}</p>
          <button
            type="button"
            onClick={() => setLastAnswer(null)}
            aria-label="Dismiss"
            className="tap-target -m-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-surface-muted"
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !pending) submit(input.trim());
        }}
        className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 shadow-sm"
      >
        <Icon name="ai" size={16} className="shrink-0 text-yellow" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={pending ? "Thinking…" : "Ask about this note or request a change…"}
          disabled={pending}
          className="min-w-0 flex-1 bg-transparent text-caption text-ink placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!input.trim() || pending}
          aria-label="Send"
          className={cn(
            "tap-target flex size-8 shrink-0 items-center justify-center rounded-full bg-ink-fill text-white transition-opacity",
            (!input.trim() || pending) && "opacity-40"
          )}
        >
          {pending ? <Icon name="spinner" size={14} className="animate-spin" /> : <Icon name="arrowLeft" size={14} className="rotate-90" />}
        </button>
      </form>
    </div>
  );
}
