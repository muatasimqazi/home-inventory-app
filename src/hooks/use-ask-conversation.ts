"use client";

import { useState } from "react";

/** Mirrors lib/ask/ask.ts's AskReference shape — redefined locally rather than imported so client components never have any import graph touching a "server-only"-guarded module, even a type-only one. Same reasoning ask-fab.tsx already used before this hook was extracted from it. */
export interface AskReference {
  kind: "item" | "transaction";
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

export interface AskConversationEntry {
  id: string;
  question: string;
  answer: string | null;
  references: AskReference[];
  error: string | null;
  pending: boolean;
}

/**
 * Extracted from ask-fab.tsx so the same question -> POST /api/v1/ask ->
 * answer+references flow can be reused wherever a caller wants "the same
 * behavior as Ask" — Search's own natural-language fallback (search
 * page's own request: "we want search to function same as ask") being
 * the first second caller. State and the actual fetch live here; each
 * caller renders entries however fits its own layout (AskFab: a floating
 * chat bubble list; Search: inline results).
 */
export function useAskConversation(householdId: string) {
  const [entries, setEntries] = useState<AskConversationEntry[]>([]);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || !householdId) return;
    const id = crypto.randomUUID();
    setEntries((prev) => [...prev, { id, question: trimmed, answer: null, references: [], error: null, pending: true }]);

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

  return { entries, ask };
}
