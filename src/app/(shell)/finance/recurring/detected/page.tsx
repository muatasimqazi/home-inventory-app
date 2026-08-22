"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { resolveCategory } from "@/lib/receipt-resolution";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { sortByLabel } from "@/lib/selectors";
import type { TransactionRecurringCandidate } from "@/lib/recurring-transaction-detection";

const FREQUENCY_LABELS: Record<TransactionRecurringCandidate["frequency"], string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

interface Row {
  candidate: TransactionRecurringCandidate;
  categoryId: string | null;
  expanded: boolean;
}

/**
 * AI recurring-bill detection review (Workstream 4) — scans the
 * household's own posted transaction history (not a fresh upload, unlike
 * ../import) for merchant+account patterns that repeat on a real cadence
 * with a consistent amount, via POST /api/v1/finance/detect-recurring
 * (lib/recurring-transaction-detection.ts's deterministic heuristic — see
 * that module's comment for why this isn't a model call). Never
 * auto-creates a RecurringBill: each candidate is shown with the actual
 * transactions it's based on and needs an explicit one-tap "Create
 * recurring bill" or "Not recurring" — same assisted-with-confirmation
 * posture as the rest of this app's AI features. A dismissal persists
 * (recurring_candidate_dismissals) so a "not recurring" verdict sticks
 * instead of the same suggestion reappearing next visit.
 */
export default function DetectedRecurringPage() {
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const accounts = useInventoryStore((s) => s.accounts);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const categoryRules = useInventoryStore((s) => s.categoryRules);
  const createRecurringBill = useInventoryStore((s) => s.createRecurringBill);
  const dismissRecurringCandidate = useInventoryStore((s) => s.dismissRecurringCandidate);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const activeCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const accountById = new Map(accounts.map((a) => [a.id, a]));

  const load = useCallback(async () => {
    if (!currentHouseholdId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/finance/detect-recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: currentHouseholdId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Couldn't check for recurring charges.");
        return;
      }
      const candidates = (data.candidates ?? []) as TransactionRecurringCandidate[];
      setRows(
        candidates.map((candidate) => {
          const resolved = resolveCategory(candidate.merchantName, "merchant", categoryRules, financeCategories);
          return { candidate, categoryId: resolved.categoryId, expanded: false };
        })
      );
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
    // categoryRules/financeCategories intentionally excluded — they only affect the *default* category guess for a freshly loaded row, not something a re-run should reset an in-progress review over.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentHouseholdId]);

  useEffect(() => {
    // Deferred a tick (react-hooks/set-state-in-effect) — load()'s own
    // setLoading(true)/setError(null) shouldn't run synchronously inside
    // the effect body itself, only as a reaction once it's scheduled.
    queueMicrotask(load);
  }, [load]);

  function updateRow(id: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.candidate.id === id ? { ...r, ...patch } : r)));
  }

  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.candidate.id !== id));
  }

  async function handleCreate(row: Row) {
    setBusyId(row.candidate.id);
    try {
      const bill = createRecurringBill({
        name: row.candidate.merchantName,
        expectedAmount: row.candidate.expectedAmount,
        frequency: row.candidate.frequency,
        nextDueDate: row.candidate.nextDueDate,
        categoryId: row.categoryId,
        accountId: row.candidate.accountId,
        ownerUserId: null, // shared by default, same as manual creation and statement import
      });
      removeRow(row.candidate.id);
      toast.success(`Added ${bill.name}`);
    } finally {
      setBusyId(null);
    }
  }

  function handleDismiss(row: Row) {
    setBusyId(row.candidate.id);
    dismissRecurringCandidate(row.candidate.accountId, row.candidate.candidateKey);
    removeRow(row.candidate.id);
    toast("Won't suggest this again", { description: row.candidate.merchantName });
    setBusyId(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/finance/recurring" className="text-caption font-medium text-muted-foreground">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Detected Recurring Charges</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Found by scanning your transaction history for repeating merchants and amounts.</p>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-12 shadow-sm">
          <Icon name="spinner" size={28} className="animate-spin text-ink" />
          <p className="text-body text-ink">Scanning transaction history…</p>
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-12 shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
            <Icon name="danger" size={26} className="text-danger" />
          </div>
          <p className="text-item-title font-semibold text-ink">Couldn&apos;t check for recurring charges</p>
          <p className="text-center text-body text-muted-foreground">{error}</p>
          <Button onClick={load}>Try again</Button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          icon="repeat"
          title="No new patterns found"
          description="Nothing in your transaction history repeated on a regular cadence with a consistent amount that isn't already tracked."
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="flex flex-col gap-3">
          {rows.map((row) => {
            const c = row.candidate;
            const account = accountById.get(c.accountId);
            const busy = busyId === c.id;
            return (
              <div key={c.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <IconChip icon="ai" tone="muted" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="truncate text-item-title font-medium text-ink">{c.merchantName}</p>
                      {c.alreadyTracked && <Badge className="bg-badge-orange-bg text-badge-orange-text">Already tracked</Badge>}
                    </div>
                    <p className="text-caption text-muted-foreground">
                      {FREQUENCY_LABELS[c.frequency]} · Seen {c.occurrenceCount}× · last {formatShortDate(c.lastOccurrence)}
                      {account ? ` · ${account.name}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-body font-semibold text-ink">{formatCurrency(c.expectedAmount)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => updateRow(c.id, { expanded: !row.expanded })}
                  className="flex items-center gap-1 self-start text-caption font-medium text-muted-foreground"
                >
                  <Icon name={row.expanded ? "chevronDown" : "chevronRight"} size={14} />
                  {row.expanded ? "Hide" : "Show"} the {c.matchingTransactions.length} transactions this is based on
                </button>

                {row.expanded && (
                  <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface-muted">
                    {c.matchingTransactions.map((t) => (
                      <div key={t.id} className="flex items-center justify-between px-3 py-2 text-caption">
                        <span className="text-muted-foreground">{formatShortDate(t.occurredAt)}</span>
                        <span className="truncate px-2 text-ink">{t.description || t.merchant}</span>
                        <span className="shrink-0 font-medium text-ink">{formatCurrency(t.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-micro text-muted-foreground">Category</label>
                  <Select value={row.categoryId ?? "__none"} onValueChange={(v) => updateRow(c.id, { categoryId: v === "__none" ? null : v })}>
                    <SelectTrigger className="h-9 w-full text-caption">
                      <SelectValue placeholder="Uncategorized" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Uncategorized</SelectItem>
                      {activeCategories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>
                          {cat.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" disabled={busy} onClick={() => handleDismiss(row)}>
                    Not recurring
                  </Button>
                  {/* Same dedupe intent as the statement-import review
                      screen's `include: !c.alreadyTracked` default
                      (finance/recurring/import/page.tsx) — the badge above
                      already tells the user a matching bill exists;
                      disabling Create here (not just labeling it) is what
                      actually stops a second, duplicate RecurringBill row
                      for the same merchant/account from being created. */}
                  <Button className="flex-1" disabled={busy || c.alreadyTracked} onClick={() => handleCreate(row)}>
                    {c.alreadyTracked ? "Already tracked" : "Create recurring bill"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
