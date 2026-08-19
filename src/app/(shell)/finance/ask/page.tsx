"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventoryStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface ConversationEntry {
  id: string;
  question: string;
  answer: string | null;
  error: string | null;
  pending: boolean;
}

const EXAMPLE_QUESTIONS = [
  "How much did I spend at Costco last month?",
  "When did I last buy milk?",
  "How much have I spent this month?",
  "What did I buy at Walmart recently?",
];

/**
 * Natural-language Q&A over the household's real finance data — "how much
 * did I spend at Costco last month?", "when did I last buy milk?". Not a
 * persisted chat thread (no DB table, nothing saved past this tab) — a
 * lightweight session log, closer to a search box with memory of what you
 * already asked than a full chat product. /api/v1/finance/ask does the
 * real work (lib/finance-ask/ask.ts): real Supabase queries via a tool
 * call, never the model guessing a number from memory.
 */
export default function FinanceAskPage() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const [entries, setEntries] = useState<ConversationEntry[]>([]);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed) return;
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, question: trimmed, answer: null, error: null, pending: true }]);
    setInput("");

    try {
      const res = await fetch("/api/v1/finance/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, householdId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: data.error ?? "Couldn't answer that." } : e)));
        return;
      }
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, answer: data.answer } : e)));
    } catch {
      setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, pending: false, error: "Couldn't reach the server. Check your connection." } : e)));
    }
  }

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] flex-col gap-4 md:min-h-[calc(100dvh-4rem)]">
      <div>
        <h1 className="flex items-center gap-2 text-screen-title font-semibold text-ink">
          <Icon name="ai" size={20} className="text-yellow" /> Ask
        </h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Ask questions about your spending.</p>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-muted-foreground">Try asking:</p>
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(q)}
                className="tap-target flex items-center gap-2 rounded-2xl border border-border bg-white px-4 py-3 text-left text-body text-ink shadow-sm"
              >
                <Icon name="ai" size={15} className="shrink-0 text-yellow" />
                {q}
              </button>
            ))}
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-2">
              <div className="self-end rounded-2xl rounded-br-sm bg-ink px-4 py-2.5 text-body text-white">{entry.question}</div>
              <div className="flex items-start gap-2 self-start rounded-2xl rounded-bl-sm border border-border bg-white px-4 py-2.5">
                <Icon name="ai" size={15} className="mt-0.5 shrink-0 text-yellow" />
                {entry.pending ? (
                  <Icon name="spinner" size={16} className="animate-spin text-muted-foreground" />
                ) : entry.error ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-body text-danger">{entry.error}</p>
                    <Button variant="outline" size="sm" onClick={() => ask(entry.question)}>
                      Try again
                    </Button>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-body text-ink">{entry.answer}</p>
                )}
              </div>
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
        className="flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your spending…"
          className="h-11 flex-1"
        />
        <Button type="submit" size="icon-lg" className={cn("rounded-md", !input.trim() && "opacity-50")} disabled={!input.trim()} aria-label="Ask">
          <Icon name="arrowLeft" size={18} className="rotate-180" />
        </Button>
      </form>
    </div>
  );
}
