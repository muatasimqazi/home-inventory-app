"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";

/** Mirrors lib/ask/ask.ts's AskReference shape — redefined locally rather than imported so this client component never has any import graph touching a "server-only"-guarded module, even a type-only one. */
interface AskReference {
  kind: "item" | "transaction";
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

interface ConversationEntry {
  id: string;
  question: string;
  answer: string | null;
  references: AskReference[];
  error: string | null;
  pending: boolean;
}

const EXAMPLE_QUESTIONS = [
  "Where did I keep my measuring tape?",
  "How much did I spend at Costco last month?",
  "When did I last buy milk?",
  "How much have I spent this month?",
];

/**
 * Global floating Ask widget — a fob in the bottom-right corner on both
 * mobile and desktop, the same shape most AI apps use, rather than a
 * dedicated page under /finance (where it started). Answers questions
 * about the household's finances *and* its physical inventory
 * ("where did I keep my measuring tape?" → the real bin, the real
 * location, a photo if one exists) — genuinely shared across domains, so
 * it's mounted once in AppShell rather than living under one of them.
 *
 * Not a persisted chat thread (no DB table) — a lightweight session log
 * that lives as long as this component does, which in practice is the
 * whole authenticated session (AppShell doesn't remount on navigation
 * within the shell route group, so the conversation survives moving
 * between pages, just not a hard refresh).
 */
export function AskFab() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, open]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || !householdId) return;
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, question: trimmed, answer: null, references: [], error: null, pending: true }]);
    setInput("");

    try {
      const res = await fetch("/api/v1/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, householdId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: data.error ?? "Couldn't answer that." } : e)));
        return;
      }
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, pending: false, answer: data.answer, references: data.references ?? [] } : e))
      );
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: "Couldn't reach the server. Check your connection." } : e)));
    }
  }

  // No household context yet (e.g. mid household-setup) — nothing to ask about.
  if (!householdId) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Ask" : "Ask"}
        className={cn(
          "tap-target fixed z-40 flex size-14 items-center justify-center rounded-full bg-ink text-white shadow-lg transition-transform active:scale-95",
          "right-4 bottom-[calc(4.375rem+env(safe-area-inset-bottom)+0.75rem)]",
          "md:right-6 md:bottom-6"
        )}
      >
        <Icon name={open ? "close" : "ai"} size={22} />
      </button>

      {open && (
        <div
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl",
            "inset-x-3 top-[max(3.5rem,env(safe-area-inset-top))] bottom-[calc(4.375rem+env(safe-area-inset-bottom)+5rem)]",
            "md:inset-x-auto md:inset-y-auto md:top-auto md:right-6 md:bottom-24 md:h-[32rem] md:w-96"
          )}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-4 py-3">
            <Icon name="ai" size={18} className="text-yellow" />
            <p className="text-body font-semibold text-ink">Ask</p>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {entries.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-caption text-muted-foreground">Try asking:</p>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="tap-target flex items-center gap-2 rounded-2xl border border-border bg-white px-3 py-2.5 text-left text-caption text-ink shadow-sm"
                  >
                    <Icon name="ai" size={13} className="shrink-0 text-yellow" />
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex flex-col gap-2">
                  <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-caption text-white">{entry.question}</div>
                  <div className="flex max-w-[90%] items-start gap-2 self-start rounded-2xl rounded-bl-sm border border-border bg-white px-3 py-2">
                    <Icon name="ai" size={13} className="mt-0.5 shrink-0 text-yellow" />
                    {entry.pending ? (
                      <Icon name="spinner" size={14} className="animate-spin text-muted-foreground" />
                    ) : entry.error ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-caption text-danger">{entry.error}</p>
                        <Button variant="outline" size="sm" onClick={() => ask(entry.question)}>
                          Try again
                        </Button>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-caption text-ink">{entry.answer}</p>
                    )}
                  </div>
                  {entry.references.length > 0 && (
                    <div className="flex w-full flex-col gap-1.5 self-start">
                      {entry.references.map((ref) => (
                        <Link
                          key={`${ref.kind}-${ref.id}`}
                          href={ref.href}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-2 rounded-xl border border-border bg-white p-2 shadow-sm"
                        >
                          {ref.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ref.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                              <Icon name={ref.kind === "item" ? "box" : "receipt"} size={16} className="text-ink" />
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-micro font-medium text-ink">{ref.title}</p>
                            {ref.subtitle && <p className="truncate text-micro text-muted-foreground">{ref.subtitle}</p>}
                          </div>
                          <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={scrollRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex shrink-0 gap-2 border-t border-border bg-white p-3"
          >
            <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything…" className="h-10 flex-1 text-caption" />
            <Button type="submit" size="icon" className={cn(!input.trim() && "opacity-50")} disabled={!input.trim()} aria-label="Send">
              <Icon name="arrowLeft" size={16} className="rotate-180" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
