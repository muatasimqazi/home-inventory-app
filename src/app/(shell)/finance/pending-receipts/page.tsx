"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { PossibleDuplicateBanner } from "@/components/possible-duplicate-banner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToReceiptScanBatch, rowToScannedTransactionDraft, rowToScannedReceiptLineItem } from "@/lib/supabase/mappers";
import { useInventoryStore } from "@/lib/store";
import { findPossibleDuplicateForDraft, type PossibleDuplicateMatch } from "@/lib/receipt-duplicate-check";
import { formatCurrency, formatShortDate, getLocalTodayIso } from "@/lib/format";
import { sortByLabel } from "@/lib/selectors";
import type { ReceiptScanBatch, ScannedTransactionDraft, ScannedReceiptLineItem } from "@/lib/types";

interface PendingGroup {
  batch: ReceiptScanBatch;
  draft: ScannedTransactionDraft;
  lineItems: ScannedReceiptLineItem[];
}

/**
 * Pending Receipts — the persistent, always-reachable counterpart to the
 * in-session scan review flow (finance/scan/review, finance/scan/review-
 * batch). Those pages only work *during* an active capture session
 * (useReceiptScanSession's client-side photos array) — fine for a photo
 * scan, which is always reviewed synchronously right after capture, but a
 * gap for anything created asynchronously with no session at all: email
 * receipts (api/v1/webhooks/resend-inbound), the one real case today.
 * Fetches scanned_transaction_drafts directly from Supabase instead of
 * the ephemeral session store, so it works regardless of how or when a
 * draft was created. Confirms through the same confirm_scanned_
 * transaction_draft() RPC the session-based flow uses — one real
 * boundary between draft and ledger row, not two.
 */
export default function PendingReceiptsPage() {
  const router = useRouter();
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const accounts = sortByLabel(useInventoryStore((s) => s.accounts), (a) => a.name);
  const transactions = useInventoryStore((s) => s.transactions);
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const myTimezone = members.find((m) => m.userId === currentUserId)?.timezone ?? null;

  const [groups, setGroups] = useState<PendingGroup[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState<Record<string, string>>({});
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [attachingId, setAttachingId] = useState<string | null>(null);
  // Duplicate-transaction prevention, part C — keyed by draft id, same
  // "check once the account is known" posture as the single-receipt
  // review page, just per-row here since this page lists many drafts at
  // once. `undefined` = not checked yet, `null` = checked, nothing found.
  const [possibleDuplicates, setPossibleDuplicates] = useState<Record<string, PossibleDuplicateMatch | null | undefined>>({});
  const [dismissedDuplicateIds, setDismissedDuplicateIds] = useState<Record<string, string>>({});

  async function checkDuplicateForGroup(group: PendingGroup, accountId: string) {
    const match = await findPossibleDuplicateForDraft({ ...group.draft, accountId }, transactions);
    setPossibleDuplicates((prev) => ({ ...prev, [group.draft.id]: match }));
  }

  useEffect(() => {
    if (!currentHouseholdId) return;
    let cancelled = false;
    async function load() {
      const supabase = getSupabaseBrowserClient();
      const { data: draftRows, error: draftError } = await supabase
        .from("scanned_transaction_drafts")
        .select("*")
        .eq("household_id", currentHouseholdId)
        .eq("status", "pending")
        .order("id", { ascending: false });
      if (draftError || cancelled) return;

      const batchIds = [...new Set((draftRows ?? []).map((d) => d.batch_id))];
      const draftIds = (draftRows ?? []).map((d) => d.id);
      const [{ data: batchRows }, { data: lineItemRows }] = await Promise.all([
        batchIds.length > 0 ? supabase.from("receipt_scan_batches").select("*").in("id", batchIds) : Promise.resolve({ data: [] }),
        draftIds.length > 0 ? supabase.from("scanned_receipt_line_items").select("*").in("draft_id", draftIds) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;

      const batchById = new Map((batchRows ?? []).map((b) => [b.id, rowToReceiptScanBatch(b)]));
      const lineItemsByDraft = new Map<string, ScannedReceiptLineItem[]>();
      for (const row of lineItemRows ?? []) {
        const li = rowToScannedReceiptLineItem(row);
        const list = lineItemsByDraft.get(li.draftId ?? "") ?? [];
        list.push(li);
        lineItemsByDraft.set(li.draftId ?? "", list);
      }

      const built: PendingGroup[] = (draftRows ?? [])
        .map((row) => rowToScannedTransactionDraft(row))
        .map((draft) => {
          const batch = batchById.get(draft.batchId);
          return batch ? { batch, draft, lineItems: lineItemsByDraft.get(draft.id) ?? [] } : null;
        })
        .filter((g): g is PendingGroup => g !== null);

      setGroups(built);
      // Kick off the duplicate check for every group whose account is
      // already known (resolved via card_last_four match at extraction
      // time) — a group with no account yet gets checked once the
      // reviewer picks one, via the Select's own onValueChange below.
      for (const group of built) {
        if (group.draft.accountId) checkDuplicateForGroup(group, group.draft.accountId);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- checkDuplicateForGroup intentionally not a dep — it closes over `transactions` fresh on each call, doesn't need to retrigger this load effect
  }, [currentHouseholdId]);

  async function handleConfirm(group: PendingGroup) {
    const accountId = selectedAccountId[group.draft.id] ?? group.draft.accountId;
    if (!accountId) {
      toast.error("Choose which account this was paid from.");
      return;
    }
    setConfirmingId(group.draft.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc("confirm_scanned_transaction_draft", {
        p_draft_id: group.draft.id,
        p_account_id: accountId,
        p_category_id: group.draft.suggestedCategoryId,
        // Same reasoning as the in-session scan review pages' own call.
        p_today: getLocalTodayIso(myTimezone),
      });
      if (error) {
        toast.error(`Couldn't confirm: ${error.message}`);
        return;
      }
      setGroups((gs) => (gs ?? []).filter((g) => g.draft.id !== group.draft.id));
      toast.success(`Confirmed — ${group.draft.store ?? "receipt"} added to your transactions`);
    } finally {
      setConfirmingId(null);
    }
  }

  // Duplicate-transaction prevention, part D — see the single-receipt
  // review page's own handleAttach for the full reasoning; this page has
  // no photo/item-purchase post-processing to redo (email-sourced drafts
  // never had either), so the RPC call alone is the whole thing.
  async function handleAttach(group: PendingGroup, match: PossibleDuplicateMatch) {
    setAttachingId(group.draft.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc("attach_scanned_draft_to_transaction", {
        p_draft_id: group.draft.id,
        p_transaction_id: match.transaction.id,
        p_category_id: group.draft.suggestedCategoryId,
      });
      if (error) {
        toast.error(`Couldn't attach: ${error.message}`);
        return;
      }
      setGroups((gs) => (gs ?? []).filter((g) => g.draft.id !== group.draft.id));
      toast.success("Attached to your existing transaction — nothing extra added");
    } finally {
      setAttachingId(null);
    }
  }

  async function handleDismiss(group: PendingGroup) {
    setDismissingId(group.draft.id);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.from("scanned_transaction_drafts").update({ status: "dismissed" }).eq("id", group.draft.id);
      if (error) {
        toast.error(`Couldn't dismiss: ${error.message}`);
        return;
      }
      setGroups((gs) => (gs ?? []).filter((g) => g.draft.id !== group.draft.id));
    } finally {
      setDismissingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Pending Receipts</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Confirm or dismiss receipts scanned or emailed in, before they become real transactions.</p>
        </div>
      </div>

      {groups === null ? (
        <div className="flex justify-center py-12">
          <Icon name="spinner" size={24} className="animate-spin text-muted-foreground" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState icon="receipt" title="Nothing pending" description="Scanned and emailed receipts land here until you confirm or dismiss them." />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <div key={group.draft.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <IconChip icon={group.batch.source === "email" ? "attachment" : "receipt"} tone="muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-body font-medium text-ink">{group.draft.store ?? "Unknown merchant"}</p>
                    {group.batch.source === "email" && <Badge className="bg-badge-purple-bg text-badge-purple-text">Via email</Badge>}
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {group.draft.suggestedDate ? formatShortDate(group.draft.suggestedDate) : "No date found"}
                    {group.lineItems.length > 0 ? ` · ${group.lineItems.length} item${group.lineItems.length === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                {group.draft.suggestedAmountCents !== null && (
                  <span className="shrink-0 text-body font-semibold text-ink">{formatCurrency(group.draft.suggestedAmountCents / 100)}</span>
                )}
              </div>

              {group.draft.reviewReason && (
                <p className="flex items-start gap-1.5 rounded-lg bg-badge-orange-bg px-3 py-2 text-caption text-badge-orange-text">
                  <Icon name="needsReview" size={14} className="mt-0.5 shrink-0" />
                  {group.draft.reviewReason}
                </p>
              )}

              {possibleDuplicates[group.draft.id] && possibleDuplicates[group.draft.id]!.transaction.id !== dismissedDuplicateIds[group.draft.id] && (
                <PossibleDuplicateBanner
                  match={possibleDuplicates[group.draft.id]!}
                  accountName={accounts.find((a) => a.id === (selectedAccountId[group.draft.id] ?? group.draft.accountId))?.name}
                  attaching={attachingId === group.draft.id}
                  onAttach={() => handleAttach(group, possibleDuplicates[group.draft.id]!)}
                  onDismiss={() => setDismissedDuplicateIds((s) => ({ ...s, [group.draft.id]: possibleDuplicates[group.draft.id]!.transaction.id }))}
                />
              )}

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                <Select
                  value={selectedAccountId[group.draft.id] ?? group.draft.accountId ?? ""}
                  onValueChange={(v) => {
                    setSelectedAccountId((s) => ({ ...s, [group.draft.id]: v }));
                    checkDuplicateForGroup(group, v);
                  }}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => handleDismiss(group)}
                  disabled={dismissingId === group.draft.id || confirmingId === group.draft.id || attachingId === group.draft.id}
                >
                  Dismiss
                </Button>
                <Button
                  onClick={() => handleConfirm(group)}
                  disabled={confirmingId === group.draft.id || dismissingId === group.draft.id || attachingId === group.draft.id}
                >
                  {confirmingId === group.draft.id ? <Icon name="spinner" size={16} className="animate-spin" /> : "Confirm"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" onClick={() => router.push("/finance/dashboard")}>
        Back to Finance
      </Button>
    </div>
  );
}
