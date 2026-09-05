"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AskConversationEntry } from "@/components/ask-conversation-entry";
import { useAskConversation } from "@/hooks/use-ask-conversation";
import type { CategorySpend } from "@/lib/selectors";

/**
 * The dedicated Finance AI tool (user request: "a dedicated ai tool...
 * with preset questions like how much have I spent on dine out this
 * week or month"). Same underlying Q&A this app already has —
 * useAskConversation + AskConversationEntry, the exact plumbing AskFab
 * (the floating widget) and Search's own "ask AI" fallback already
 * share — just its own prominent card instead of a floating panel, per
 * the explicit placement decision (a card on the Dashboard, not a
 * separate page). AskFab stays mounted and general-purpose (both
 * Finance and Inventory); this card is Finance-scoped and impossible to
 * miss on the one page most "how much did I spend on X" questions
 * start from.
 *
 * `id="ask-ai"` — the Transactions page links to `#ask-ai` rather than
 * duplicating this UI there.
 */
export function FinanceAiCard({ householdId, categorySpend }: { householdId: string; categorySpend: CategorySpend[] }) {
  const { entries, ask, confirmPendingAction, cancelPendingAction } = useAskConversation(householdId);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [entries]);

  // Personalized, not generic hardcoded text — built from categories
  // this household is actually spending in this month (already computed
  // by the dashboard page for its own breakdown chart, so this costs
  // nothing extra), rather than e.g. a hardcoded "dining out" chip that
  // might not even apply to a given household. Top 2 real categories +
  // one fixed, always-useful question.
  const presetQuestions = [
    ...categorySpend.slice(0, 2).map((c) => `How much have I spent on ${c.name} this month?`),
    "What's my biggest spending category this month?",
  ];

  function submit(question: string) {
    setInput("");
    ask(question);
  }

  return (
    <div id="ask-ai" className="scroll-mt-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Icon name="ai" size={16} className="text-yellow" />
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Ask about your money</p>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {entries.length === 0 ? (
          presetQuestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {presetQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => ask(q)}
                  className="tap-target rounded-full border border-border bg-surface-muted px-3 py-1.5 text-left text-caption text-ink"
                >
                  {q}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
            {entries.map((entry) => (
              <AskConversationEntry key={entry.id} entry={entry} onRetry={ask} onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />
            ))}
            <div ref={scrollRef} />
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex gap-2"
        >
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask anything about your finances…" className="h-10 flex-1 text-caption" />
          <Button type="submit" size="icon" className={!input.trim() ? "opacity-50" : undefined} disabled={!input.trim()} aria-label="Send">
            <Icon name="arrowLeft" size={16} className="rotate-180" />
          </Button>
        </form>
      </div>
    </div>
  );
}
