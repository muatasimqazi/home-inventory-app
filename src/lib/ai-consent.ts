// App Store Guidelines 5.1.1(i) / 5.1.2(i) — before any AI feature sends a
// user's data to a third-party AI service, the app has to say what is
// sent, say who it goes to, and get the user's permission. Apple rejected
// build 1.0 (6) for doing the first two only in the privacy policy, so
// this is the one place that consent is defined: the in-app dialog
// (components/ai-consent-dialog.tsx), the Settings toggle, every AI route's
// server-side check (lib/ai-consent-server.ts), and the privacy policy's
// "AI Features" section all read from here, so they can't drift apart.
//
// Stored per user in Supabase Auth user_metadata, not a table — it's the
// user's own choice about their own data, needs no migration, and every AI
// route already has the user object from auth.getUser() in hand.

import type { User } from "@supabase/supabase-js";

/** Bump when AI_DATA_SENT or AI_RECIPIENTS changes materially, so everyone is asked again. */
export const AI_CONSENT_VERSION = 1;

export const AI_CONSENT_METADATA_KEY = "ai_data_consent";

/** Error code every AI route returns (with HTTP 403) when the caller hasn't agreed. */
export const AI_CONSENT_REQUIRED_CODE = "ai_consent_required";

/** What a feature shows when the user picked "Not now" in the consent dialog. */
export const AI_CONSENT_DECLINED_MESSAGE = "AI features are off. Turn them on in Settings to use this.";

export type AiConsentRecord = { version: number; grantedAt: string } | null;

export const AI_RECIPIENTS = [
  { name: "Vercel AI Gateway", role: "Routes each request to the AI model provider below." },
  { name: "Google (Gemini)", role: "The main model for questions, photo and document reading, suggestions, and generated photos." },
  { name: "OpenAI", role: "Voice transcription and read-aloud, and the backup model if Gemini is unavailable." },
] as const;

export const AI_DATA_SENT = [
  "Questions you ask, and the household records needed to answer them (items, locations, transactions, notes, tasks)",
  "Photos you choose to scan: items, bins, receipts, labels, documents, clothing",
  "Bank statements you upload, and receipts you forward by email",
  "Transaction descriptions and amounts, when you ask for categories, budgets, or subscription detection",
  "Note text, when you use the note assistant",
  "Voice recordings, when you use the microphone, and answer text, when you have answers read aloud",
] as const;

export function readAiConsent(user: Pick<User, "user_metadata"> | null | undefined): AiConsentRecord {
  const raw = (user?.user_metadata as Record<string, unknown> | undefined)?.[AI_CONSENT_METADATA_KEY];
  if (!raw || typeof raw !== "object") return null;
  const { version, grantedAt } = raw as { version?: unknown; grantedAt?: unknown };
  if (typeof version !== "number" || typeof grantedAt !== "string") return null;
  return { version, grantedAt };
}

/** True only for consent given to the *current* disclosure — an older version doesn't count. */
export function hasAiConsent(user: Pick<User, "user_metadata"> | null | undefined): boolean {
  return readAiConsent(user)?.version === AI_CONSENT_VERSION;
}
