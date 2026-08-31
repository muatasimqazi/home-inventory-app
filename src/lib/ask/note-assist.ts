import "server-only";
import { generateText, Output, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";

// AI assistant docked at the bottom of the Notes WYSIWYG editor
// (components/note-assistant-bar.tsx) — "ask about this note or request a
// change." Deliberately its own module, not folded into lib/ask/ask.ts:
// that one answers questions about the household's *data* (finances,
// inventory) via tool-calling against Supabase; this one only ever reads
// the one note's content the client already has and either answers a
// question about it or rewrites it — no DB access, no tools, so it
// doesn't need a household id, a Supabase client, or RLS at all. Same
// Gateway-routed primary/fallback pair as every other AI capability in
// this app (lib/finance/categorize.ts, lib/vision/detect.ts) — no reason
// to add a third model choice for a text-only task both already handle.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

const CALL_TIMEOUT_MS = 30_000;
const CALL_MAX_RETRIES = 0;

// Capped — this is session-local conversation context (see
// note-assistant-bar.tsx), not a persisted thread, so a long back-and-
// forth just gets truncated to its most recent turns rather than growing
// the prompt unboundedly.
const MAX_HISTORY_TURNS = 6;

export interface NoteAssistTurn {
  role: "user" | "assistant";
  content: string;
}

export type NoteAssistResult = { type: "answer"; message: string } | { type: "edit"; message: string; content: string };

const resultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("answer"),
    message: z.string().describe("A direct answer to the user's question about this note. Plain prose, not Markdown — this renders in a chat bubble."),
  }),
  z.object({
    type: z.literal("edit"),
    message: z.string().describe("One short sentence describing what changed, e.g. 'Added a packing checklist.' Plain prose, not Markdown."),
    content: z
      .string()
      .describe(
        "The COMPLETE new note content, in Markdown, replacing the current content entirely. Preserve everything the user didn't ask to change. Use real Markdown syntax the note's renderer understands: '- ' for bullet lists, '1. ' for numbered lists, '- [ ] '/'- [x] ' for checklists, pipe tables, **bold**, *italic*."
      ),
  }),
]);

function systemPrompt(title: string, content: string): string {
  return (
    `You are an assistant embedded in one household note titled "${title || "Untitled note"}". ` +
    "The user will either ask a question about the note's content, or ask you to change it. Decide which: " +
    'respond with type "answer" for a question (e.g. "what\'s the total on this list?", "when did I add this?") — ' +
    'you only have the content below, not any outside history, so answer only from what\'s actually there. ' +
    'Respond with type "edit" for any request to add, remove, rewrite, reorganize, or format the note ' +
    '(e.g. "add a packing checklist", "turn this into a table", "make it shorter"). ' +
    "For an edit, return the note's ENTIRE new content, not just the changed part — anything the user didn't ask " +
    "to change should carry over exactly as it was. Keep using Markdown syntax the note supports: '- ' bullet " +
    "lists, '1. ' numbered lists, '- [ ] '/'- [x] ' checklists, pipe tables, **bold**, *italic*. Never invent " +
    "facts (dates, amounts, names) that aren't already in the note or the user's own request.\n\n" +
    `Current note content (Markdown):\n${content || "(empty)"}`
  );
}

async function runAssist(model: LanguageModel, title: string, content: string, history: NoteAssistTurn[], message: string): Promise<NoteAssistResult> {
  const messages: ModelMessage[] = [
    ...history.slice(-MAX_HISTORY_TURNS).map((turn) => ({ role: turn.role, content: turn.content }) as ModelMessage),
    { role: "user", content: message },
  ];
  const { output } = await generateText({
    model,
    system: systemPrompt(title, content),
    messages,
    output: Output.object({ schema: resultSchema }),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return output;
}

/**
 * Answers a question about one note, or rewrites it, per the user's
 * message. Primary model tried first; on any failure, falls back to a
 * cheap OpenAI model once — same reliability shape as every other AI
 * capability in this app (lib/vision/detect.ts, lib/finance/categorize.ts).
 */
export async function assistWithNote(title: string, content: string, history: NoteAssistTurn[], message: string): Promise<NoteAssistResult> {
  try {
    return await runAssist(PRIMARY_MODEL, title, content, history, message);
  } catch (primaryError) {
    console.error("Primary note-assist model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runAssist(FALLBACK_MODEL, title, content, history, message);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed (note-assist):`, fallbackError);
      throw fallbackError;
    }
  }
}
