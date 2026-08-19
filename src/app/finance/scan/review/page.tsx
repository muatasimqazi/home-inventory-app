"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useInventoryStore } from "@/lib/store";
import { useReceiptScanSession } from "@/lib/receipt-scan-session-store";
import { formatCurrency } from "@/lib/format";
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
  const batch = useReceiptScanSession((s) => s.batch);
  const drafts = useReceiptScanSession((s) => s.drafts);
  const updateDraft = useReceiptScanSession((s) => s.updateDraft);
  const reset = useReceiptScanSession((s) => s.reset);

  const accounts = sortByLabel(useInventoryStore((s) => s.accounts), (a) => a.name);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const linkTransactionAttachment = useInventoryStore((s) => s.linkTransactionAttachment);

  const [confirming, setConfirming] = useState(false);

  const draft = (drafts ?? []).find((d) => d.status === "pending");
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
      });
      if (error) {
        toast.error(`Couldn't confirm: ${error.message}`);
        return;
      }

      // Reuses the photo already uploaded to Storage during extraction
      // (receipt-scan-session-store.ts's runExtraction) rather than
      // uploading it again — same permanent-retention resolution
      // (Addendum §6), one upload, not two.
      const storagePath = batch.sourceImagePaths[draft.photoIndex];
      if (storagePath && data) {
        const dataUrl = useReceiptScanSession.getState().photos[draft.photoIndex];
        const blob = dataUrl ? await (await fetch(dataUrl)).blob() : null;
        await linkTransactionAttachment(data.id, {
          storagePath,
          contentType: blob?.type || "image/jpeg",
          sizeBytes: blob?.size || 1,
          sourceDraftId: draft.id,
        });
      }

      toast.success(`Confirmed — ${draft.store ?? "receipt"} added to your transactions`);
      reset();
      router.replace(`/finance/transactions`);
    } finally {
      setConfirming(false);
    }
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
            {draft.lineItems.map((li) => (
              <div key={li.id} className="flex items-center gap-3 px-4 py-3">
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
            ))}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
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
