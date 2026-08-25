"use client";

import { useAskConversationStore, type AskReference, type AskConversationEntry } from "@/lib/ask-conversation-store";

export type { AskReference, AskConversationEntry };

/**
 * Thin per-caller wrapper around the single app-wide conversation in
 * lib/ask-conversation-store.ts. Every caller (AskFab, FinanceAiCard,
 * Search's ask-AI fallback) reads and appends to the *same* entries list now
 * — see that store's comment for why — this hook just binds `ask` to the
 * caller's householdId so call sites don't change (`ask(question)`, not
 * `ask(householdId, question)`).
 */
export function useAskConversation(householdId: string) {
  const entries = useAskConversationStore((s) => s.entries);
  const askFn = useAskConversationStore((s) => s.ask);

  return { entries, ask: (question: string) => askFn(householdId, question) };
}
