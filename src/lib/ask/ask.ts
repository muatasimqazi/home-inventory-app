import "server-only";
import { generateText, stepCountIs, type LanguageModel } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatShortDate } from "@/lib/format";
import { createAskTools } from "./tools";

// Same Gateway routing, same primary/fallback pair already proven for
// vision (lib/vision/detect.ts) — this is a text+tool-calling task, not
// vision, but there's no established text-specific pair in this codebase
// yet and no reason to introduce a third model choice for one feature.
const PRIMARY_MODEL: LanguageModel = "google/gemini-3.7-flash";
const FALLBACK_MODEL: LanguageModel = "openai/gpt-5-nano";

// Longer than vision detection's 30s bound (lib/vision/detect.ts) — a
// tool-calling answer can take several model round-trips (decide to call
// a tool, read its result, decide whether to call another, compose the
// final answer), where vision detection is always exactly one call.
// maxRetries: 0 for the same reason as detect.ts: on failure, move to a
// completely different model rather than the SDK's own same-model
// backoff-retry.
const CALL_TIMEOUT_MS = 45_000;
const CALL_MAX_RETRIES = 0;

/** One result card the Ask panel can render inline below the prose answer — an item with its real container/location (and photo, when there is one), a specific transaction, a note, or a task — not just text claiming they exist. Also how a *confirmed* createNote/createTask/addSubtaskToTask write shows itself back to the user afterward (see /api/v1/ask/confirm): the card links straight to the real record that now exists, the same "here's proof, go verify it yourself" role it plays for a search result. */
export interface AskReference {
  kind: "item" | "transaction" | "note" | "task";
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string | null;
  href: string;
}

/**
 * A Notes/Tasks write the model wants to make, proposed but not yet
 * performed — createNote/createTask/addSubtaskToTask (lib/ask/tools.ts)
 * never write to the database themselves; each just returns one of these.
 * The Ask panel renders it as a real Confirm/Cancel card (not a plain
 * reference link); tapping Confirm POSTs `kind` + `payload` straight to
 * /api/v1/ask/confirm, which is what actually calls
 * performCreateNote/performCreateTask/performAddSubtaskToTask. `payload`'s
 * shape depends on `kind` — see each propose tool's own inputSchema/
 * pendingAction shape in lib/ask/tools.ts for what it carries.
 */
export interface PendingAction {
  kind: "createNote" | "createTask" | "addSubtaskToTask";
  /** One-line, human-readable description of the write for the confirm card, e.g. 'Create task "Buy milk", due Sep 6'. */
  summary: string;
  payload: Record<string, unknown>;
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return (
    `You answer questions about this household — both its finances and its physical inventory. Today's date is ${today}. ` +
    "Always call a tool to look up real data before answering a question about spending, purchases, transactions, " +
    "or where something is kept — never guess or estimate a number, date, or location from memory. Call a tool " +
    "more than once if a question genuinely needs more than one search (e.g. comparing two vendors, or narrowing " +
    "an initial search that returned nothing useful). " +
    "For 'where is my X' questions, use findInventoryItems and always state the actual container and location by " +
    "name (e.g. 'in the Leather Tools bin, in the Office') — never just 'it's in your inventory.' If nothing " +
    "matches, say so plainly and suggest a different search term rather than guessing. " +
    "For 'what am I missing from my X' or 'what should I have in my X' questions, use findMissingCommonItems. " +
    "This compares against a generic reference catalog, not a precise inventory audit — phrase the answer as a " +
    "rough suggestion, and say so plainly (never guess a location or an item list yourself) if it reports no " +
    "matching location or no reference data. " +
    "Transaction amounts are signed: negative means money spent, positive means money received (income or " +
    "a refund) — describe spending as a positive dollar figure in your answer, don't say 'spent -$40'. " +
    "When summarizing total spend, use searchTransactions'/getSpendByCategory's own totalAmount/totalSpend/" +
    "count fields, which reflect every match — never add up only the transactions/categories listed, since " +
    "the list can be capped or ranked short of the true total. " +
    "For 'how much have I spent on [category]' or 'what's my biggest spending category' questions, use " +
    "getSpendByCategory, not searchTransactions — it looks up real spending categories, where " +
    "searchTransactions only matches merchant/item text. Always compute dateFrom/dateTo yourself before " +
    "calling it: 'this month' = the 1st of the current month through today, 'this week' = the last 7 days " +
    "including today — never leave both blank unless the question genuinely means all-time. " +
    "You can also read the household's Notes and Tasks, and draft writes to them. searchNotes/searchTasks " +
    "answer 'do I have a note about X', 'what tasks do I have', 'what's overdue', etc. createNote/createTask/" +
    "addSubtaskToTask do NOT save anything by calling them — each only drafts the write and shows the user a " +
    "Confirm/Cancel card; nothing is written until they tap Confirm. So when the user's intent is clear, still " +
    "just call the tool right away (don't ask 'should I create this?' in words first — the confirm card IS " +
    "that check) — but phrase your answer as a still-pending draft, e.g. 'I've drafted that task, due tomorrow " +
    "at 9am — tap Confirm to save it' or 'Drafted that note — confirm to save it,' never 'added'/'saved'/" +
    "'created' as if it already happened, since it hasn't yet. Only ask a clarifying question in words first " +
    "when something genuinely required to act is actually missing or ambiguous — which existing task " +
    "addSubtaskToTask should add to (if taskAmbiguous/taskNotFound comes back), or whether an open-ended " +
    "'remember to feed the fish' should be a Note (something to keep) or a Task (something to do, needs a due " +
    "date) when it's truly unclear which was meant. A Note has no due date and isn't 'done' or 'not done' — " +
    "it's for saving information. A Task always has a due date and represents something to do — use it for " +
    "anything with a 'when' (reminders, chores, appointments). Tasks default to shared with the whole " +
    "household — pass createTask's isShared:false only when the user explicitly wants it personal/private " +
    "('just for me', 'don't show the family'). " +
    "For 'remind me what to wear every day', 'send me a daily weather update', or 'stop the weather " +
    "notifications', use setWeatherReminder — this is a notification preference, not a Note or a Task, and " +
    "unlike those it executes immediately with no Confirm step, so describe it as already done. " +
    "Keep answers short and direct: state the number, date, or location first, then at most one sentence of " +
    "relevant context. No preamble, no restating the question — the specific item/transaction you found is shown " +
    "separately below your answer, so don't re-describe it in exhaustive detail either. " +
    "Respond in plain prose only — this renders in a plain-text chat bubble, not a markdown viewer, so never use " +
    "**bold**, *italics*, `code`, bullet/numbered lists, or headings; write it the way you'd say it out loud."
  );
}

/** Shared by both searchTransactions' `transactions` and getSpendByCategory's `topTransactions` — same result-card shape either way. */
function transactionRefs(transactions: { id: string; merchant: string | null; description: string | null; date: string; matchedItem?: string }[]): AskReference[] {
  return transactions.map((t) => ({
    kind: "transaction",
    id: t.id,
    title: t.matchedItem ?? t.merchant ?? t.description ?? "Transaction",
    subtitle: t.matchedItem ? (t.merchant ?? null) : null,
    imageUrl: null,
    href: `/finance/transactions?transactionId=${t.id}`,
  }));
}

/** Pulls result cards out of what the tools actually returned this turn — not something the model is asked to narrate separately, so it can't drift from what was really found. Capped and deduped; the model may call the same tool more than once while narrowing a search. */
function extractReferences(toolResults: { toolName: string; output: unknown }[]): AskReference[] {
  const refs: AskReference[] = [];

  for (const tr of toolResults) {
    if (tr.toolName === "findInventoryItems") {
      const output = tr.output as { items?: { id: string; name: string; container: string | null; location: string | null; photoUrl: string | null }[] };
      for (const item of output.items ?? []) {
        refs.push({
          kind: "item",
          id: item.id,
          title: item.name,
          subtitle: [item.container, item.location].filter(Boolean).join(" · ") || null,
          imageUrl: item.photoUrl,
          href: `/items/${item.id}`,
        });
      }
    } else if (tr.toolName === "searchTransactions") {
      const output = tr.output as { transactions?: { id: string; merchant: string | null; description: string | null; date: string; matchedItem?: string }[] };
      refs.push(...transactionRefs(output.transactions ?? []));
    } else if (tr.toolName === "getSpendByCategory") {
      const output = tr.output as { topTransactions?: { id: string; merchant: string | null; description: string | null; date: string }[] };
      refs.push(...transactionRefs(output.topTransactions ?? []));
    } else if (tr.toolName === "searchNotes") {
      const output = tr.output as { notes?: { id: string; title: string; snippet: string; pinned: boolean }[] };
      for (const note of output.notes ?? []) {
        refs.push({ kind: "note", id: note.id, title: note.title, subtitle: note.snippet || null, imageUrl: null, href: `/notes/${note.id}` });
      }
    } else if (tr.toolName === "searchTasks") {
      const output = tr.output as { tasks?: { id: string; title: string; dueAt: string; category: string }[] };
      for (const task of output.tasks ?? []) {
        refs.push({ kind: "task", id: task.id, title: task.title, subtitle: `${task.category} · ${formatShortDate(task.dueAt)}`, imageUrl: null, href: `/tasks/${task.id}` });
      }
    }
    // createNote/createTask/addSubtaskToTask deliberately produce no
    // reference card here — they haven't written anything yet. Their
    // output (when it's a real proposal, not a taskNotFound/taskAmbiguous
    // read-only result) is pulled by extractPendingActions below instead.
  }

  const seen = new Set<string>();
  return refs
    .filter((r) => {
      const key = `${r.kind}-${r.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

/** Pulls every real write proposal (see PendingAction's own doc comment) out of what the tools returned this turn — same "don't let the model narrate this separately" reasoning as extractReferences. taskNotFound/taskAmbiguous results from addSubtaskToTask carry no `pendingAction` and are correctly skipped here; the model's own text already explains those. */
function extractPendingActions(toolResults: { toolName: string; output: unknown }[]): PendingAction[] {
  const actions: PendingAction[] = [];
  for (const tr of toolResults) {
    if (tr.toolName !== "createNote" && tr.toolName !== "createTask" && tr.toolName !== "addSubtaskToTask") continue;
    const output = tr.output as { pendingAction?: PendingAction };
    if (output.pendingAction) actions.push(output.pendingAction);
  }
  return actions;
}

interface AskResult {
  text: string;
  references: AskReference[];
  pendingActions: PendingAction[];
}

async function runAsk(model: LanguageModel, question: string, supabase: SupabaseClient, householdId: string): Promise<AskResult> {
  const result = await generateText({
    model,
    system: systemPrompt(),
    prompt: question,
    tools: createAskTools(supabase, householdId),
    stopWhen: stepCountIs(4),
    timeout: CALL_TIMEOUT_MS,
    maxRetries: CALL_MAX_RETRIES,
  });
  return { text: result.text, references: extractReferences(result.toolResults), pendingActions: extractPendingActions(result.toolResults) };
}

/**
 * Answers one natural-language question about the household — finances,
 * inventory, notes, or tasks — and can draft (never directly perform)
 * writes to Notes/Tasks (createNote/createTask/addSubtaskToTask in
 * lib/ask/tools.ts) as PendingActions the UI must get an explicit Confirm
 * on (see /api/v1/ask/confirm) before anything is actually saved. Primary
 * model tried first; on any failure, falls back to a cheap OpenAI model
 * once — same reasoning as detectItems() in lib/vision/detect.ts.
 */
export async function askQuestion(question: string, supabase: SupabaseClient, householdId: string): Promise<AskResult> {
  try {
    return await runAsk(PRIMARY_MODEL, question, supabase, householdId);
  } catch (primaryError) {
    console.error("Primary ask model failed, falling back to", FALLBACK_MODEL, primaryError);
    try {
      return await runAsk(FALLBACK_MODEL, question, supabase, householdId);
    } catch (fallbackError) {
      console.error(`Fallback model ${FALLBACK_MODEL} also failed:`, fallbackError);
      throw fallbackError;
    }
  }
}
