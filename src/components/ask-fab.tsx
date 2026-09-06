"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AskConversationEntry } from "@/components/ask-conversation-entry";
import { VoiceInputButton } from "@/components/voice-input-button";
import { useAskConversation } from "@/hooks/use-ask-conversation";
import { useAskConversationStore } from "@/lib/ask-conversation-store";
import { speakAnswer } from "@/lib/speak-answer";
import { useInventoryStore } from "@/lib/store";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { cn } from "@/lib/utils";

const EXAMPLE_QUESTIONS = [
  "Where did I keep my measuring tape?",
  "How much did I spend at Costco last month?",
  "When did I last buy milk?",
  "Remind me to take out the trash tomorrow",
];

/**
 * Global floating Ask widget — a fob in the bottom-right corner on both
 * mobile and desktop, the same shape most AI apps use, rather than a
 * dedicated page under /finance (where it started). Answers questions
 * about the household's finances *and* its physical inventory
 * ("where did I keep my measuring tape?" → the real bin, the real
 * location, a photo if one exists) — genuinely shared across domains, so
 * it's mounted once in AppShell rather than living under one of them.
 *
 * Not a persisted chat thread (no DB table) — a lightweight session log
 * that lives as long as the browser tab does. The conversation itself
 * lives in lib/ask-conversation-store.ts, shared by every Ask surface
 * (this widget, the Finance dashboard's "Ask about your money" card,
 * Search's fallback) rather than local state on this component, so it
 * survives moving between pages — including a page that unmounted this
 * very component's siblings — same as this panel's own `open` state
 * (also store-backed, for the same reason: another surface needs to be
 * able to open this panel even though it doesn't render it).
 *
 * The question/answer flow itself (state + the POST /api/v1/ask call) and
 * the per-entry chat-bubble rendering both live in shared modules now
 * (hooks/use-ask-conversation.ts, components/ask-conversation-entry.tsx)
 * so the Search page's own "ask AI" fallback behaves identically instead
 * of being a second hand-drawn copy.
 */
export function AskFab() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const open = useAskConversationStore((s) => s.panelOpen);
  const togglePanel = useAskConversationStore((s) => s.togglePanel);
  const { entries, ask, confirmPendingAction, cancelPendingAction } = useAskConversation(householdId);
  const [input, setInput] = useState("");
  // Set only by the mic (VoiceInputButton's onTranscript below), cleared
  // on any manual edit — see submit()'s own comment on why this decides
  // whether the answer gets spoken back (docs/Voice Input Addendum.md §3).
  const askedByVoiceRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // This panel is a hand-rolled `fixed`-position element, not the shared
  // Sheet component — sheet.tsx already applies this same fix for every
  // Radix-based bottom sheet in the app, but this one built its own
  // positioning and missed it. Without it, focusing the chat input on iOS
  // Safari (which never resizes the layout viewport for the keyboard, only
  // the *visual* one) leaves the panel's bottom edge — and the input sitting
  // in it — anchored behind the keyboard instead of just above it.
  const keyboardInset = useKeyboardInset();

  useEffect(() => {
    if (open) scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries, open]);

  function submit(question: string) {
    setInput("");
    // Only a voice-originated question gets its answer spoken back — a
    // typed question stays purely text-in-text-out (docs/Voice Input
    // Addendum.md §3's own reasoning: Ask shouldn't start talking
    // unprompted just because someone typed a quick question). entries
    // only ever grows by one per ask() call in this single-tab session,
    // so the entry right after whatever was last before this call is
    // reliably the one this question produced.
    const viaVoice = askedByVoiceRef.current;
    askedByVoiceRef.current = false;
    const beforeCount = useAskConversationStore.getState().entries.length;
    void ask(question).then(() => {
      if (!viaVoice) return;
      const answer = useAskConversationStore.getState().entries[beforeCount]?.answer;
      if (answer) speakAnswer(answer);
    });
  }

  // No household context yet (e.g. mid household-setup) — nothing to ask about.
  if (!householdId) return null;

  return (
    <>
      <button
        type="button"
        onClick={togglePanel}
        aria-label={open ? "Close Ask" : "Ask"}
        className={cn(
          "tap-target fixed z-40 flex size-14 items-center justify-center rounded-full bg-ink-fill text-white shadow-lg transition-transform active:scale-95 print:hidden",
          "right-4 bottom-[calc(4.375rem+env(safe-area-inset-bottom)+0.75rem)]",
          "md:right-6 md:bottom-6"
        )}
      >
        <Icon name={open ? "close" : "ai"} size={22} />
      </button>

      {open && (
        <div
          className={cn(
            "fixed z-40 flex flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-2xl print:hidden",
            "inset-x-3 top-[max(3.5rem,env(safe-area-inset-top))] bottom-[calc(4.375rem+env(safe-area-inset-bottom)+5rem)]",
            "md:inset-x-auto md:inset-y-auto md:top-auto md:right-6 md:bottom-24 md:h-[32rem] md:w-96"
          )}
          // Nudges the panel up by however much the keyboard is currently
          // covering, on top of its normal resting position — a translate
          // rather than overriding `bottom` directly (unlike sheet.tsx,
          // whose resting bottom is a plain 0) since this panel's resting
          // bottom is already a non-trivial calc() expression. 0 on desktop
          // (no keyboard, keyboardInset stays 0) and md:bottom-24 wins there
          // via the class anyway — the transform is a harmless no-op there.
          style={{ transform: keyboardInset > 0 ? `translateY(-${keyboardInset}px)` : undefined }}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-4 py-3">
            <Icon name="ai" size={18} className="text-yellow" />
            <p className="text-body font-semibold text-ink">Ask</p>
          </div>

          <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
            {entries.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-caption text-muted-foreground">Try asking:</p>
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="tap-target flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2.5 text-left text-caption text-ink shadow-sm"
                  >
                    <Icon name="ai" size={13} className="shrink-0 text-yellow" />
                    {q}
                  </button>
                ))}
              </div>
            ) : (
              entries.map((entry) => (
                <AskConversationEntry key={entry.id} entry={entry} onRetry={ask} onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />
              ))
            )}
            <div ref={scrollRef} />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(input);
            }}
            className="flex shrink-0 gap-2 border-t border-border bg-card p-3"
          >
            <Input
              value={input}
              onChange={(e) => {
                askedByVoiceRef.current = false;
                setInput(e.target.value);
              }}
              placeholder="Ask anything…"
              className="h-10 flex-1 text-caption"
            />
            <VoiceInputButton
              onTranscript={(text) => {
                askedByVoiceRef.current = true;
                setInput(text);
              }}
            />
            <Button type="submit" size="icon" className={cn(!input.trim() && "opacity-50")} disabled={!input.trim()} aria-label="Send">
              <Icon name="arrowLeft" size={16} className="rotate-180" />
            </Button>
          </form>
        </div>
      )}
    </>
  );
}
