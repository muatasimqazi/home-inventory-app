import Link from "next/link";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { stripMarkdown } from "@/lib/ask/strip-markdown";
import { useAskConversationStore } from "@/lib/ask-conversation-store";
import type { AskConversationEntry as Entry } from "@/hooks/use-ask-conversation";

/**
 * One question/answer/references block — the exact rendering ask-fab.tsx
 * always had, extracted so the Search page's "same behavior as Ask"
 * fallback (see use-ask-conversation.ts) renders identically rather than
 * a second hand-drawn copy of the same chat bubbles.
 *
 * Tapping a reference always opens the shared floating Ask panel
 * (ask-fab.tsx) before navigating — the conversation itself is already
 * shared (lib/ask-conversation-store.ts), so whichever surface this entry
 * is rendered on (the floating widget itself, the Finance dashboard's
 * card, Search's fallback), landing on the transaction/item page leaves
 * the same conversation open in that small window instead of stranding it
 * on a page that just unmounted.
 */
export function AskConversationEntry({ entry, onRetry }: { entry: Entry; onRetry: (question: string) => void }) {
  const openPanel = useAskConversationStore((s) => s.openPanel);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink px-3 py-2 text-caption text-white">{entry.question}</div>
      <div className="flex max-w-[90%] items-start gap-2 self-start rounded-2xl rounded-bl-sm border border-border bg-white px-3 py-2">
        <Icon name="ai" size={13} className="mt-0.5 shrink-0 text-yellow" />
        {entry.pending ? (
          <Icon name="spinner" size={14} className="animate-spin text-muted-foreground" />
        ) : entry.error ? (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-danger">{entry.error}</p>
            <Button variant="outline" size="sm" onClick={() => onRetry(entry.question)}>
              Try again
            </Button>
          </div>
        ) : (
          <p className="whitespace-pre-wrap text-caption text-ink">{entry.answer ? stripMarkdown(entry.answer) : entry.answer}</p>
        )}
      </div>
      {entry.references.length > 0 && (
        <div className="flex w-full flex-col gap-1.5 self-start">
          {entry.references.map((ref) => (
            <Link
              key={`${ref.kind}-${ref.id}`}
              href={ref.href}
              onClick={openPanel}
              className="flex items-center gap-2 rounded-xl border border-border bg-white p-2 shadow-sm"
            >
              {ref.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ref.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
                  <Icon name={ref.kind === "item" ? "box" : "receipt"} size={16} className="text-ink" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-micro font-medium text-ink">{ref.title}</p>
                {ref.subtitle && <p className="truncate text-micro text-muted-foreground">{ref.subtitle}</p>}
              </div>
              <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
