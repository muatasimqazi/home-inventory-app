import { Icon } from "@/components/icon";
import { formatCurrency, formatShortDate } from "@/lib/format";
import type { PossibleDuplicateMatch } from "@/lib/receipt-duplicate-check";

/**
 * Duplicate-transaction prevention, part C's UI — same badge-orange
 * "possible duplicate" visual vocabulary this app already uses in two
 * other places (the needsReview banner both receipt-review pages already
 * have, and the CSV import review table's "Possible duplicate" labeling)
 * rather than inventing new colors for a third. Never merges anything
 * itself — a human confirms one way or the other.
 */
export function PossibleDuplicateBanner({
  match,
  accountName,
  onAttach,
  onDismiss,
  attaching,
}: {
  match: PossibleDuplicateMatch;
  accountName?: string;
  onAttach: () => void;
  onDismiss: () => void;
  attaching: boolean;
}) {
  const { transaction, reasoning } = match;
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-badge-orange-border bg-badge-orange-bg p-3">
      <Icon name="needsReview" size={16} className="mt-0.5 shrink-0 text-badge-orange-text" />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-badge-orange-text">
          This looks like it might already be on {accountName ?? "this account"} — {formatCurrency(Math.abs(transaction.amount))} on{" "}
          {formatShortDate(transaction.occurredAt)}
          {transaction.merchant ? `, ${transaction.merchant}` : ""}.
        </p>
        {reasoning && <p className="mt-1 text-caption text-badge-orange-text/80">{reasoning}</p>}
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={onAttach} disabled={attaching} className="text-caption font-semibold text-badge-orange-text underline">
            {attaching ? "Attaching…" : "Attach receipt to this transaction"}
          </button>
          <button type="button" onClick={onDismiss} disabled={attaching} className="text-caption text-muted-foreground">
            No, this is separate
          </button>
        </div>
      </div>
    </div>
  );
}
