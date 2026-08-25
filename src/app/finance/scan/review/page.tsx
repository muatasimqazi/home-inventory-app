"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LinkPurchaseSheet } from "@/components/link-purchase-sheet";
import { PossibleDuplicateBanner } from "@/components/possible-duplicate-banner";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useInventoryStore } from "@/lib/store";
import { useReceiptScanSession } from "@/lib/receipt-scan-session-store";
import { findPossibleDuplicateForDraft, type PossibleDuplicateMatch } from "@/lib/receipt-duplicate-check";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { formatCurrency, getLocalTodayIso } from "@/lib/format";
import { sortByLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";

function centsToDisplay(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

/**
 * Single Receipt Review (docs/Personal Finance PRD.md §35 "14 · Receipt
 * Review") — the one-pending-draft path from /finance/scan. Every line
 * item extracted is shown (raw name, standardized name, category guess,
 * qty) even though only the receipt's own total becomes the ledger
 * transaction (Receipt Scanning Addendum §2: one receipt, one
 * transaction, full line-item detail underneath, never split into
 * per-category ledger rows).
 */
export default function SingleReceiptReviewPage() {
  const router = useRouter();
  // iOS Safari doesn't shrink the layout viewport when the keyboard opens
  // (see the hook's own comment) — without this, focusing a field above
  // pushes this fixed Save bar behind the keyboard. No-op on Chromium.
  const keyboardInset = useKeyboardInset();
  const batch = useReceiptScanSession((s) => s.batch);
  const drafts = useReceiptScanSession((s) => s.drafts);
  const updateDraft = useReceiptScanSession((s) => s.updateDraft);
  const reset = useReceiptScanSession((s) => s.reset);

  const accounts = sortByLabel(useInventoryStore((s) => s.accounts), (a) => a.name);
  const transactions = useInventoryStore((s) => s.transactions);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const myTimezone = members.find((m) => m.userId === currentUserId)?.timezone ?? null;
  const linkTransactionAttachment = useInventoryStore((s) => s.linkTransactionAttachment);
  const items = useInventoryStore((s) => s.items);
  const itemPurchases = useInventoryStore((s) => s.itemPurchases);
  const linkItemPurchase = useInventoryStore((s) => s.linkItemPurchase);
  const unlinkItemPurchase = useInventoryStore((s) => s.unlinkItemPurchase);

  const [confirming, setConfirming] = useState(false);
  const [attaching, setAttaching] = useState(false);
  // Duplicate-transaction prevention, part C — checked once the account
  // is known (either auto-resolved via card_last_four match, or picked
  // here). `dismissedTransactionId` remembers a "No, this is separate"
  // answer so re-running the check (e.g. after some other field changes)
  // doesn't resurface the same already-answered prompt.
  const [possibleDuplicate, setPossibleDuplicate] = useState<PossibleDuplicateMatch | null>(null);
  const [dismissedTransactionId, setDismissedTransactionId] = useState<string | null>(null);
  // Which line item the "Link to item" sheet is open for — PRD §25's
  // assisted matching applies here too: a receipt can be linked to
  // inventory items before it's even confirmed into a real transaction
  // (item_purchases.scanned_receipt_line_item_id), same "user confirms a
  // candidate" shape as Transaction Detail's own copy of this affordance.
  const [linkingLineItemId, setLinkingLineItemId] = useState<string | null>(null);

  const draft = (drafts ?? []).find((d) => d.status === "pending");

  useEffect(() => {
    if (!draft?.accountId) return;
    let cancelled = false;
    findPossibleDuplicateForDraft(draft, transactions).then((match) => {
      if (cancelled) return;
      setPossibleDuplicate(match && match.transaction.id !== dismissedTransactionId ? match : null);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on accountId only, not every keystroke in amount/store/date — see this effect's own comment above.
  }, [draft?.accountId]);
  const activeCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );

  if (!draft || !batch) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <p className="text-body font-medium text-ink">No receipt to review</p>
        <p className="text-caption text-muted-foreground">Start a new scan from Finance.</p>
        <Button onClick={() => router.replace("/finance/dashboard")}>Back to Finance</Button>
      </div>
    );
  }

  // Shared by handleConfirm (a freshly-inserted transaction) and
  // handleAttach (an existing one, duplicate-transaction prevention part
  // D) — everything after "there is now a real transaction id" is
  // identical either way: attach the already-uploaded receipt photo, and
  // backfill any item_purchases links made during review.
  async function finishReceiptLink(transactionId: string) {
    if (!draft || !batch) return;
    const supabase = getSupabaseBrowserClient();

    // Reuses the photo already uploaded to Storage during extraction
    // (receipt-scan-session-store.ts's runExtraction) rather than
    // uploading it again — same permanent-retention resolution
    // (Addendum §6), one upload, not two.
    const storagePath = batch.sourceImagePaths[draft.photoIndex];
    if (storagePath) {
      const dataUrl = useReceiptScanSession.getState().photos[draft.photoIndex];
      const blob = dataUrl ? await (await fetch(dataUrl)).blob() : null;
      await linkTransactionAttachment(transactionId, {
        storagePath,
        contentType: blob?.type || "image/jpeg",
        sizeBytes: blob?.size || 1,
        sourceDraftId: draft.id,
      });
    }

    // Any item_purchases link made during review (this page's own "Link
    // to item" affordance below) only had a scanned_receipt_line_item_id
    // to point at — the confirmed transaction now exists, so backfill
    // transactionId onto those links too (item_purchases' own comment:
    // "or both once a draft resolves into a real transaction"). Realtime
    // (store.ts's item_purchases subscription) picks up the resulting
    // row change locally; no need to also patch local state here.
    const lineItemIds = draft.lineItems.map((li) => li.id);
    if (lineItemIds.length > 0) {
      const { error: backfillError } = await supabase
        .from("item_purchases")
        .update({ transaction_id: transactionId })
        .in("scanned_receipt_line_item_id", lineItemIds)
        .is("transaction_id", null);
      if (backfillError) {
        // Not atomic with the RPC above — a real gap the reviewer
        // correctly flagged as belonging inside that RPC instead,
        // deferred rather than folded into this merge. Until then, at
        // minimum don't let this fail silently: a link made during
        // review would otherwise stay permanently anchored only by
        // scanned_receipt_line_item_id and read as "pending" forever
        // even though the receipt was, in fact, confirmed.
        console.error("Couldn't backfill item_purchases.transaction_id:", backfillError.message);
        toast.error("Confirmed, but couldn't finish linking an item to this receipt — check the item's Purchase & Warranty section.");
      }
    }
  }

  async function handleConfirm() {
    // TS doesn't propagate the component-level `!draft || !batch` guard's
    // narrowing into this closure — re-asserted here rather than `draft!`
    // scattered through every access below.
    if (!draft || !batch) return;
    if (!draft.accountId) {
      toast.error("Choose which account this receipt was paid from.");
      return;
    }
    setConfirming(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.rpc("confirm_scanned_transaction_draft", {
        p_draft_id: draft.id,
        p_account_id: draft.accountId,
        p_category_id: draft.suggestedCategoryId,
        // Only actually used server-side when the AI couldn't read a date
        // off the receipt at all (draft.suggested_date is null) — see the
        // migration's own comment. Computed here, not left to the RPC's
        // `current_date` fallback, so "today" means the scanning member's
        // own calendar day (their Settings > your profile timezone, or
        // this device's) instead of the database server's (UTC).
        p_today: getLocalTodayIso(myTimezone),
      });
      if (error) {
        toast.error(`Couldn't confirm: ${error.message}`);
        return;
      }
      if (data) await finishReceiptLink(data.id);

      toast.success(`Confirmed — ${draft.store ?? "receipt"} added to your transactions`);
      reset();
      router.replace(`/finance/transactions`);
    } finally {
      setConfirming(false);
    }
  }

  // Duplicate-transaction prevention, part D — the "Attach" side of the
  // possible-duplicate banner: instead of confirm_scanned_transaction_
  // draft() inserting a brand-new row, attach_scanned_draft_to_transaction
  // reassigns this receipt's line items onto the transaction that's
  // already there (Plaid-synced, most likely), and no second row for the
  // same real charge ever gets created.
  async function handleAttach() {
    if (!draft || !possibleDuplicate) return;
    setAttaching(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.rpc("attach_scanned_draft_to_transaction", {
        p_draft_id: draft.id,
        p_transaction_id: possibleDuplicate.transaction.id,
        p_category_id: draft.suggestedCategoryId,
      });
      if (error) {
        toast.error(`Couldn't attach: ${error.message}`);
        return;
      }
      await finishReceiptLink(possibleDuplicate.transaction.id);
      toast.success("Attached to your existing transaction — nothing extra added");
      reset();
      router.replace("/finance/transactions");
    } finally {
      setAttaching(false);
    }
  }

  async function handlePickItemToLink(result: { id: string; suggested: boolean }) {
    if (!linkingLineItemId) return;
    const res = await linkItemPurchase({
      itemId: result.id,
      scannedReceiptLineItemId: linkingLineItemId,
      source: result.suggested ? "ai_suggested" : "manual",
    });
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't link that item.");
      return;
    }
    toast.success("Item linked");
  }

  function handleUnlinkItem(purchaseId: string) {
    unlinkItemPurchase(purchaseId);
    toast("Link removed");
  }

  return (
    <div className="min-h-dvh bg-background pb-28">
      <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => {
            reset();
            router.replace("/finance/dashboard");
          }}
          aria-label="Cancel"
          className="tap-target flex size-9 items-center justify-center rounded-full bg-surface-muted"
        >
          <Icon name="close" size={16} />
        </button>
        <h1 className="text-body font-semibold text-ink">Review Receipt</h1>
      </header>

      <div className="flex flex-col gap-4 p-4">
        {draft.needsReview && (
          <div className="flex items-start gap-2 rounded-2xl border border-badge-orange-border bg-badge-orange-bg p-3">
            <Icon name="needsReview" size={16} className="mt-0.5 shrink-0 text-badge-orange-text" />
            <p className="text-caption text-badge-orange-text">{draft.reviewReason ?? "This receipt needs a closer look."}</p>
          </div>
        )}

        {possibleDuplicate && (
          <PossibleDuplicateBanner
            match={possibleDuplicate}
            accountName={accounts.find((a) => a.id === draft.accountId)?.name}
            attaching={attaching}
            onAttach={handleAttach}
            onDismiss={() => {
              setDismissedTransactionId(possibleDuplicate.transaction.id);
              setPossibleDuplicate(null);
            }}
          />
        )}

        <div className="rounded-2xl border border-border bg-white p-4">
          <label className="mb-1 block text-caption text-muted-foreground">Store</label>
          <Input value={draft.store ?? ""} onChange={(e) => updateDraft(draft.id, { store: e.target.value })} className="h-11" />

          <label className="mt-3 mb-1 block text-caption text-muted-foreground">Date</label>
          <Input
            type="date"
            value={draft.suggestedDate ?? ""}
            onChange={(e) => updateDraft(draft.id, { suggestedDate: e.target.value })}
            className="h-11"
          />

          <label className="mt-3 mb-1 block text-caption text-muted-foreground">Total</label>
          <Input
            value={centsToDisplay(draft.suggestedAmountCents)}
            onChange={(e) => updateDraft(draft.id, { suggestedAmountCents: Math.round(Number(e.target.value || 0) * 100) })}
            className="h-11"
            inputMode="decimal"
          />

          <label className="mt-3 mb-1 block text-caption text-muted-foreground">Category</label>
          <Select value={draft.suggestedCategoryId ?? ""} onValueChange={(v) => updateDraft(draft.id, { suggestedCategoryId: v, categorySource: "user_corrected" })}>
            <SelectTrigger className="h-11 w-full">
              <SelectValue placeholder="Uncategorized" />
            </SelectTrigger>
            <SelectContent>
              {activeCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="mt-3 mb-1 block text-caption text-muted-foreground">Paid from</label>
          <Select value={draft.accountId ?? ""} onValueChange={(v) => updateDraft(draft.id, { accountId: v })}>
            <SelectTrigger className={cn("h-11 w-full", !draft.accountId && "border-danger/50")}>
              <SelectValue placeholder="Choose an account" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((a) => a.status === "active")
                .map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                    {a.cardLastFour ? ` · ...${a.cardLastFour}` : ""}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <h2 className="mb-2 text-item-title font-semibold text-ink">
            Items ({draft.lineItems.length})
          </h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
            {draft.lineItems.map((li) => {
              const linkedPurchase = itemPurchases.find((p) => p.scannedReceiptLineItemId === li.id);
              const linkedItem = linkedPurchase ? items.find((it) => it.id === linkedPurchase.itemId) : undefined;
              return (
                <div key={li.id} className="flex flex-col gap-1.5 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium text-ink">{li.standardName || li.rawItem}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {li.rawItem !== li.standardName ? `${li.rawItem} · ` : ""}
                        Qty {li.quantity}
                        {li.confidence !== null && li.confidence < 0.75 ? " · low confidence" : ""}
                      </p>
                    </div>
                    <span className="shrink-0 text-body font-medium text-ink">{li.lineTotalCents !== null ? formatCurrency(li.lineTotalCents / 100) : "—"}</span>
                  </div>
                  {linkedPurchase ? (
                    <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
                      <Icon name="link" size={12} />
                      Linked to {linkedItem?.name ?? "an item"}
                      <button type="button" onClick={() => handleUnlinkItem(linkedPurchase.id)} className="font-medium text-danger">
                        Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setLinkingLineItemId(li.id)}
                      className="flex items-center gap-1 self-start text-micro font-medium text-yellow-text"
                    >
                      <Icon name="link" size={12} /> Link to item
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <LinkPurchaseSheet
        open={!!linkingLineItemId}
        onOpenChange={(open) => !open && setLinkingLineItemId(null)}
        mode="item"
        referenceDate={draft.suggestedDate}
        onPick={handlePickItemToLink}
      />

      <div
        className="fixed inset-x-0 bottom-0 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        style={{ bottom: keyboardInset }}
      >
        <Button size="lg" className="w-full bg-ink text-white hover:bg-ink/90" onClick={handleConfirm} disabled={confirming}>
          {confirming ? <Icon name="spinner" size={16} className="animate-spin" /> : `Confirm — ${draft.suggestedAmountCents !== null ? formatCurrency(draft.suggestedAmountCents / 100) : ""}`}
        </Button>
        <button
          type="button"
          onClick={() => {
            updateDraft(draft.id, { status: "dismissed" });
            reset();
            router.replace("/finance/dashboard");
          }}
          className="mt-2 w-full text-center text-caption text-muted-foreground"
        >
          Dismiss this receipt
        </button>
      </div>
    </div>
  );
}
