"use client";

import { create } from "zustand";
import { useInventoryStore } from "@/lib/store";

/** Mirrors lib/ask/ask.ts's AskReference shape — redefined locally rather than imported so client components never have any import graph touching a "server-only"-guarded module, even a type-only one. Keep `kind` in sync with that file's own union by hand. */
export interface AskReference {
  kind: "item" | "transaction" | "note" | "task";
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

/**
 * Mirrors lib/ask/ask.ts's PendingAction shape, same "redefined locally,
 * not imported" reasoning as AskReference above — plus the client-only
 * bookkeeping (`id`, `status`, `error`, `resultReference`) that server
 * response never carries, since only this store tracks a proposal's
 * lifecycle through Confirm/Cancel.
 */
export interface PendingAction {
  /** Client-generated (crypto.randomUUID()) — the server response carries no id of its own for a proposal that hasn't been written yet, and this store needs a stable key to target Confirm/Cancel at one specific card. */
  id: string;
  kind: "createNote" | "createTask" | "addSubtaskToTask";
  summary: string;
  payload: Record<string, unknown>;
  status: "pending" | "confirming" | "done" | "cancelled" | "error";
  error?: string;
  /** Set once status is "done" — the real record /api/v1/ask/confirm just created/updated, rendered the same way a search-result reference card is. */
  resultReference?: AskReference;
}

export interface AskConversationEntry {
  id: string;
  question: string;
  answer: string | null;
  references: AskReference[];
  pendingActions: PendingAction[];
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
  /** Actually performs a proposed Notes/Tasks write (POST /api/v1/ask/confirm) — the one point at which anything from a createNote/createTask/addSubtaskToTask proposal is really saved. */
  confirmPendingAction: (householdId: string, entryId: string, actionId: string) => Promise<void>;
  /** Discards a proposal without ever calling the server — nothing was written, so there's nothing to undo. */
  cancelPendingAction: (entryId: string, actionId: string) => void;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

function updateAction(
  entries: AskConversationEntry[],
  entryId: string,
  actionId: string,
  patch: Partial<PendingAction>
): AskConversationEntry[] {
  return entries.map((e) =>
    e.id === entryId ? { ...e, pendingActions: e.pendingActions.map((a) => (a.id === actionId ? { ...a, ...patch } : a)) } : e
  );
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
export const useAskConversationStore = create<AskConversationState>()((set, get) => ({
  entries: [],
  panelOpen: false,

  ask: async (householdId, question) => {
    const trimmed = question.trim();
    if (!trimmed || !householdId) return;
    const id = crypto.randomUUID();
    set((s) => ({
      entries: [...s.entries, { id, question: trimmed, answer: null, references: [], pendingActions: [], error: null, pending: true }],
    }));

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
      const pendingActions: PendingAction[] = (data.pendingActions ?? []).map(
        (pa: { kind: PendingAction["kind"]; summary: string; payload: Record<string, unknown> }) => ({
          id: crypto.randomUUID(),
          kind: pa.kind,
          summary: pa.summary,
          payload: pa.payload,
          status: "pending" as const,
        })
      );
      set((s) => ({
        entries: s.entries.map((e) => (e.id === id ? { ...e, pending: false, answer: data.answer, references: data.references ?? [], pendingActions } : e)),
      }));
    } catch {
      set((s) => ({
        entries: s.entries.map((e) => (e.id === id ? { ...e, pending: false, error: "Couldn't reach the server. Check your connection." } : e)),
      }));
    }
  },

  confirmPendingAction: async (householdId, entryId, actionId) => {
    set((s) => ({ entries: updateAction(s.entries, entryId, actionId, { status: "confirming" }) }));
    const action = get()
      .entries.find((e) => e.id === entryId)
      ?.pendingActions.find((a) => a.id === actionId);
    if (!action) return;

    try {
      const res = await fetch("/api/v1/ask/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, kind: action.kind, payload: action.payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        set((s) => ({ entries: updateAction(s.entries, entryId, actionId, { status: "error", error: data.error ?? "Couldn't complete that." }) }));
        return;
      }
      // This was a server-side insert (POST /api/v1/ask/confirm, via a
      // Next.js API route, not this browser's own createNote/createTask/
      // createSubtask) — the confirming user's own Tasks/Notes pages would
      // otherwise only pick it up once this browser's realtime
      // subscription happens to mirror it back, same as it would for
      // another household member's change. Merging the full record into
      // useInventoryStore directly means it shows up immediately, same as
      // every other create in this app already does for its own browser.
      if (data.record) useInventoryStore.getState().receiveExternalCreate(data.record);
      set((s) => ({ entries: updateAction(s.entries, entryId, actionId, { status: "done", resultReference: data.reference }) }));
    } catch {
      set((s) => ({ entries: updateAction(s.entries, entryId, actionId, { status: "error", error: "Couldn't reach the server. Check your connection." }) }));
    }
  },

  cancelPendingAction: (entryId, actionId) => {
    set((s) => ({ entries: updateAction(s.entries, entryId, actionId, { status: "cancelled" }) }));
  },

  openPanel: () => set({ panelOpen: true }),
  closePanel: () => set({ panelOpen: false }),
  togglePanel: () => set((s) => ({ panelOpen: !s.panelOpen })),
}));
