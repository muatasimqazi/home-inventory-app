import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { stripMarkdown } from "@/lib/ask/strip-markdown";
import { useAskConversationStore } from "@/lib/ask-conversation-store";
import type { AskConversationEntry as Entry, AskReference, PendingAction } from "@/hooks/use-ask-conversation";

// One fallback icon per reference kind, shown only when the reference has
// no real photo (imageUrl) of its own — item/transaction predate note/task
// (added alongside the Ask assistant's Notes/Tasks read+write tools).
const REFERENCE_ICON: Record<AskReference["kind"], IconName> = {
  item: "box",
  transaction: "receipt",
  note: "notebook",
  task: "tasks",
};

const PENDING_ACTION_ICON: Record<PendingAction["kind"], IconName> = {
  createNote: "notebook",
  createTask: "tasks",
  addSubtaskToTask: "tasks",
};

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
 *
 * `onConfirm`/`onCancel` back a real Verification gate (see
 * lib/ask/tools.ts's own top comment on why createNote/createTask/
 * addSubtaskToTask never write anything themselves) — a pendingAction
 * renders as its own Confirm/Cancel card, distinct from the plain
 * tap-to-navigate reference cards below it, and only becomes one of those
 * (via `resultReference`) once actually confirmed.
 */
export function AskConversationEntry({
  entry,
  onRetry,
  onConfirm,
  onCancel,
}: {
  entry: Entry;
  onRetry: (question: string) => void;
  onConfirm: (entryId: string, actionId: string) => void;
  onCancel: (entryId: string, actionId: string) => void;
}) {
  const openPanel = useAskConversationStore((s) => s.openPanel);

  return (
    <div className="flex flex-col gap-2">
      <div className="max-w-[85%] self-end rounded-2xl rounded-br-sm bg-ink-fill px-3 py-2 text-caption text-white">{entry.question}</div>
      <div className="flex max-w-[90%] items-start gap-2 self-start rounded-2xl rounded-bl-sm border border-border bg-card px-3 py-2">
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

      {entry.pendingActions.map((action) => (
        <PendingActionCard
          key={action.id}
          action={action}
          onOpenResult={openPanel}
          onConfirm={() => onConfirm(entry.id, action.id)}
          onCancel={() => onCancel(entry.id, action.id)}
        />
      ))}

      {entry.references.length > 0 && (
        <div className="flex w-full flex-col gap-1.5 self-start">
          {entry.references.map((reference) => (
            <ReferenceCard key={`${reference.kind}-${reference.id}`} reference={reference} onOpen={openPanel} />
          ))}
        </div>
      )}
    </div>
  );
}

// `reference`, not `ref` — React 19 lets a plain prop be named `ref`, but
// that's exactly the kind of "technically works, reads as a DOM ref"
// naming worth avoiding for a value that's actually an AskReference.
function ReferenceCard({ reference, onOpen }: { reference: AskReference; onOpen: () => void }) {
  return (
    <Link href={reference.href} onClick={onOpen} className="flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm">
      {reference.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={reference.imageUrl} alt="" className="size-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface-muted">
          <Icon name={REFERENCE_ICON[reference.kind]} size={16} className="text-ink" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-micro font-medium text-ink">{reference.title}</p>
        {reference.subtitle && <p className="truncate text-micro text-muted-foreground">{reference.subtitle}</p>}
      </div>
      <Icon name="chevronRight" size={14} className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

/**
 * A proposed Notes/Tasks write, not yet real — renders as one of four
 * things depending on `action.status`: an editable-looking Confirm/Cancel
 * prompt ("pending"), the same prompt with both buttons disabled mid-flight
 * ("confirming"), the real ReferenceCard once it actually saved ("done" —
 * the one point where a pendingAction converges with a normal search
 * result), or a quiet dismissed line ("cancelled")/inline error+retry
 * ("error").
 */
function PendingActionCard({
  action,
  onOpenResult,
  onConfirm,
  onCancel,
}: {
  action: PendingAction;
  onOpenResult: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (action.status === "done" && action.resultReference) {
    return <ReferenceCard reference={action.resultReference} onOpen={onOpenResult} />;
  }

  if (action.status === "cancelled") {
    return (
      <div className="flex items-center gap-2 self-start rounded-xl border border-dashed border-border px-3 py-2 text-micro text-muted-foreground">
        <Icon name="close" size={12} className="shrink-0" />
        Cancelled — nothing was saved.
      </div>
    );
  }

  const confirming = action.status === "confirming";
  return (
    <div className="flex w-full flex-col gap-2 self-start rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-yellow/15">
          <Icon name={PENDING_ACTION_ICON[action.kind]} size={15} className="text-yellow-text" />
        </span>
        <p className="min-w-0 flex-1 text-caption text-ink">{action.summary}</p>
      </div>
      {action.status === "error" && <p className="text-caption text-danger">{action.error ?? "Couldn't complete that."}</p>}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={onCancel} disabled={confirming}>
          Cancel
        </Button>
        <Button size="sm" className="flex-1" onClick={onConfirm} disabled={confirming}>
          {confirming ? <Icon name="spinner" size={14} className="animate-spin" /> : action.status === "error" ? "Try again" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
