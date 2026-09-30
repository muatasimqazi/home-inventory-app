"use client";

import { create } from "zustand";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { AI_CONSENT_METADATA_KEY, AI_CONSENT_VERSION, hasAiConsent } from "@/lib/ai-consent";

interface AiConsentState {
  /** Whether the globally-mounted <AiConsentDialog/> is showing. */
  open: boolean;
  /** Resolves the ensureAiConsent() call that opened the dialog. */
  resolve: ((granted: boolean) => void) | null;
  /** Called by the dialog's buttons. */
  decide: (granted: boolean) => Promise<void>;
}

/**
 * Client half of lib/ai-consent.ts. Same "small standalone zustand store +
 * one globally-mounted component" shape as lightbox-store.ts, so any AI
 * call site can ask for consent with one line and no per-page wiring.
 */
export const useAiConsentStore = create<AiConsentState>((set, get) => ({
  open: false,
  resolve: null,
  decide: async (granted) => {
    if (granted) await setAiConsent(true);
    get().resolve?.(granted);
    set({ open: false, resolve: null });
  },
}));

/**
 * Call immediately before any request that sends user data to an AI
 * route. Resolves true straight away if the user has already agreed to
 * the current disclosure; otherwise shows the consent dialog and resolves
 * with their answer. On false, don't make the request.
 */
export async function ensureAiConsent(): Promise<boolean> {
  const {
    data: { session },
  } = await getSupabaseBrowserClient().auth.getSession();
  if (hasAiConsent(session?.user)) return true;

  // A second AI call while the dialog is already up (e.g. two features
  // firing together) waits on the same answer instead of stacking dialogs.
  const pending = useAiConsentStore.getState();
  if (pending.open && pending.resolve) {
    const previous = pending.resolve;
    return new Promise((resolve) => {
      useAiConsentStore.setState({
        resolve: (granted) => {
          previous(granted);
          resolve(granted);
        },
      });
    });
  }

  return new Promise((resolve) => useAiConsentStore.setState({ open: true, resolve }));
}

/** Grants (current version) or withdraws consent — used by the dialog and by Settings. */
export async function setAiConsent(granted: boolean): Promise<void> {
  const { error } = await getSupabaseBrowserClient().auth.updateUser({
    data: { [AI_CONSENT_METADATA_KEY]: granted ? { version: AI_CONSENT_VERSION, grantedAt: new Date().toISOString() } : null },
  });
  if (error) throw error;
}
