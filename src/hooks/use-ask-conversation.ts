"use client";

import { useAskConversationStore, type AskReference, type AskConversationEntry, type PendingAction } from "@/lib/ask-conversation-store";

export type { AskReference, AskConversationEntry, PendingAction };

/**
 * Thin per-caller wrapper around the single app-wide conversation in
 * lib/ask-conversation-store.ts. Every caller (AskFab, FinanceAiCard,
 * Search's ask-AI fallback) reads and appends to the *same* entries list now
 * — see that store's comment for why — this hook just binds `ask`/
 * `confirmPendingAction` to the caller's householdId so call sites don't
 * change (`ask(question)`, not `ask(householdId, question)`).
 */
export function useAskConversation(householdId: string) {
  const entries = useAskConversationStore((s) => s.entries);
  const askFn = useAskConversationStore((s) => s.ask);
  const confirmFn = useAskConversationStore((s) => s.confirmPendingAction);
  const cancelPendingAction = useAskConversationStore((s) => s.cancelPendingAction);

  return {
    entries,
    ask: (question: string) => askFn(householdId, question),
    confirmPendingAction: (entryId: string, actionId: string) => confirmFn(householdId, entryId, actionId),
    cancelPendingAction,
  };
}
