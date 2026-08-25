"use client";

import { create } from "zustand";

/** Mirrors lib/ask/ask.ts's AskReference shape — redefined locally rather than imported so client components never have any import graph touching a "server-only"-guarded module, even a type-only one. */
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

interface AskConversationState {
  entries: AskConversationEntry[];
  /** Whether the floating Ask panel (ask-fab.tsx) is open. Lives here rather
   * than as local state on AskFab so any surface that shares this
   * conversation — the Finance dashboard's "Ask about your money" card,
   * Search's inline "ask AI" fallback — can open it too. */
  panelOpen: boolean;

  ask: (householdId: string, question: string) => Promise<void>;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

/**
 * Single, app-wide Ask conversation shared by every surface that offers
 * "ask about your money/stuff" (AskFab's floating widget, the Finance
 * dashboard's dedicated card, Search's ask-AI fallback) — previously each
 * surface held its own useState via hooks/use-ask-conversation.ts, so a
 * conversation started from e.g. the Finance dashboard card vanished the
 * moment its page unmounted (following a transaction/item reference link
 * navigates away). Centralizing it here means the conversation — and the
 * ability to get back to it via the floating panel, which stays mounted
 * across navigation (see AskFab) — survives no matter which surface (or
 * which reference link branching off it) the user started from.
 */
export const useAskConversationStore = create<AskConversationState>()((set) => ({
  entries: [],
  panelOpen: false,

  ask: async (householdId, question) => {
    const trimmed = question.trim();
    if (!trimmed || !householdId) return;
    const id = crypto.randomUUID();
    set((s) => ({ entries: [...s.entries, { id, question: trimmed, answer: null, references: [], error: null, pending: true }] }));

    try {
      const res = await fetch("/api/v1/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed, householdId }),
      });
      const data = await res.json();
      if (!res.ok) {
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, pending: false, error: data.error ?? "Couldn't answer that." } : e)) }));
        return;
      }
      set((s) => ({
        entries: s.entries.map((e) => (e.id === id ? { ...e, pending: false, answer: data.answer, references: data.references ?? [] } : e)),
      }));
    } catch {
      set((s) => ({
        entries: s.entries.map((e) => (e.id === id ? { ...e, pending: false, error: "Couldn't reach the server. Check your connection." } : e)),
      }));
    }
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
