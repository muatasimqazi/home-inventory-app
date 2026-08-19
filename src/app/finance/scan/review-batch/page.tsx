"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useInventoryStore } from "@/lib/store";
import { useReceiptScanSession, type DraftRow } from "@/lib/receipt-scan-session-store";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { sortByLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";

/**
 * Bulk Statement Review (docs/Personal Finance PRD.md §35 "15 · Bulk
 * Statement Review", Receipt Scanning Addendum §2) — a scannable,
 * editable, removable list of every draft the batch produced, not N
 * single-review screens shown in sequence (the same BulkReviewList
 * precedent inventory's own multi-item detection already established).
 *
 * Reachable two ways: straight from the camera flow (session store is
 * already populated by runExtraction), or via `?batchId=` for a batch that
 * already exists in Supabase but this tab never produced itself — a bulk
 * historical import seeding drafts directly, or resuming a batch abandoned
 * mid-review in another tab. loadBatch() is the counterpart to
 * runExtraction for that second path.
 */
export default function BulkStatementReviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const batchIdParam = searchParams.get("batchId");
  const batch = useReceiptScanSession((s) => s.batch);
  const drafts = useReceiptScanSession((s) => s.drafts);
  const updateDraft = useReceiptScanSession((s) => s.updateDraft);
  const reset = useReceiptScanSession((s) => s.reset);
  const loadBatch = useReceiptScanSession((s) => s.loadBatch);

  const accounts = sortByLabel(useInventoryStore((s) => s.accounts), (a) => a.name);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const linkTransactionAttachment = useInventoryStore((s) => s.linkTransactionAttachment);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!batchIdParam) return;
    let cancelled = false;
    async function run() {
      // Read the store directly rather than depending on `batch?.id` in
      // this effect's own dep array — `batch` is this effect's *output*,
      // not an input; including it created a self-cancelling race (the
      // effect tore itself down the instant loadBatch succeeded, cancelling
      // a still-in-flight StrictMode-duplicate call before it could ever
      // clear the loading state).
      if (useReceiptScanSession.getState().batch?.id === batchIdParam) return;
      setLoadingBatch(true);
      setLoadError(null);
      const result = await loadBatch(batchIdParam!);
      if (cancelled) return;
      setLoadingBatch(false);
      if (!result.ok) setLoadError(result.error ?? "Couldn't load that batch.");
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [batchIdParam, loadBatch]);

  const activeCategories = sortByLabel(
    financeCategories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const pending = (drafts ?? []).filter((d) => d.status === "pending");

  if (loadingBatch) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <Icon name="spinner" size={24} className="animate-spin text-muted-foreground" />
        <p className="text-caption text-muted-foreground">Loading batch…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <p className="text-body font-medium text-ink">Couldn&apos;t load that batch</p>
        <p className="text-caption text-muted-foreground">{loadError}</p>
        <Button onClick={() => router.replace("/finance/transactions")}>Go to Transactions</Button>
      </div>
    );
  }

  if (!drafts || !batch || pending.length === 0) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background px-8 text-center">
        <p className="text-body font-medium text-ink">Nothing left to review</p>
        <Button onClick={() => { reset(); router.replace("/finance/transactions"); }}>Go to Transactions</Button>
      </div>
    );
  }

  async function confirmOne(draft: DraftRow): Promise<boolean> {
    if (!draft.accountId) {
      toast.error(`Choose an account for ${draft.store ?? "this receipt"}.`);
      return false;
    }
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("confirm_scanned_transaction_draft", {
      p_draft_id: draft.id,
      p_account_id: draft.accountId,
      p_category_id: draft.suggestedCategoryId,
    });
    if (error) {
      toast.error(`Couldn't confirm ${draft.store ?? "receipt"}: ${error.message}`);
      return false;
    }
    updateDraft(draft.id, { status: "confirmed", resultingTransactionId: data?.id ?? null });

    const storagePath = batch!.sourceImagePaths[draft.photoIndex];
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
    return true;
  }

  async function handleConfirmOne(draft: DraftRow) {
    setConfirmingId(draft.id);
    try {
      const ok = await confirmOne(draft);
      if (ok) toast.success(`Confirmed ${draft.store ?? "receipt"}`);
    } finally {
      setConfirmingId(null);
    }
  }

  async function handleConfirmAll() {
    const readyDrafts = pending.filter((d) => !d.needsReview && d.accountId);
    if (readyDrafts.length === 0) {
      toast.error("Every remaining receipt needs a closer look first.");
      return;
    }
    setConfirmingAll(true);
    try {
      let confirmedCount = 0;
      for (const draft of readyDrafts) {
        if (await confirmOne(draft)) confirmedCount++;
      }
      toast.success(`Confirmed ${confirmedCount} receipt${confirmedCount === 1 ? "" : "s"}`);
      if (useReceiptScanSession.getState().drafts?.every((d) => d.status !== "pending")) {
        reset();
        router.replace("/finance/transactions");
      }
    } finally {
      setConfirmingAll(false);
    }
  }

  function handleDismiss(draft: DraftRow) {
    updateDraft(draft.id, { status: "dismissed" });
  }

  const readyCount = pending.filter((d) => !d.needsReview && d.accountId).length;

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
        <div>
          <h1 className="text-body font-semibold text-ink">Review Statement</h1>
          <p className="text-caption text-muted-foreground">{pending.length} receipt{pending.length === 1 ? "" : "s"} found</p>
        </div>
      </header>

      <div className="flex flex-col gap-3 p-4">
        {pending.map((draft) => (
          <div key={draft.id} className="rounded-2xl border border-border bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-body font-semibold text-ink">{draft.store || "Unknown store"}</p>
                <p className="text-caption text-muted-foreground">
                  {draft.suggestedDate ? formatShortDate(draft.suggestedDate) : "—"} · {draft.lineItems.length} item{draft.lineItems.length === 1 ? "" : "s"}
                </p>
              </div>
              <span className="shrink-0 text-item-title font-semibold text-ink">
                {draft.suggestedAmountCents !== null ? formatCurrency(draft.suggestedAmountCents / 100) : "—"}
              </span>
            </div>

            {draft.needsReview && (
              <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-badge-orange-bg px-2.5 py-1.5">
                <Icon name="needsReview" size={13} className="mt-0.5 shrink-0 text-badge-orange-text" />
                <p className="text-micro text-badge-orange-text">{draft.reviewReason}</p>
              </div>
            )}

            <div className="mt-3 flex gap-2">
              <Select value={draft.suggestedCategoryId ?? ""} onValueChange={(v) => updateDraft(draft.id, { suggestedCategoryId: v, categorySource: "user_corrected" })}>
                <SelectTrigger className="h-9 flex-1">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={draft.accountId ?? ""} onValueChange={(v) => updateDraft(draft.id, { accountId: v })}>
                <SelectTrigger className={cn("h-9 flex-1", !draft.accountId && "border-danger/50")}>
                  <SelectValue placeholder="Account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.status === "active")
                    .map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-3 flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => handleDismiss(draft)}>
                Dismiss
              </Button>
              <Button size="sm" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={() => handleConfirmOne(draft)} disabled={confirmingId === draft.id}>
                {confirmingId === draft.id ? <Icon name="spinner" size={14} className="animate-spin" /> : "Confirm"}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Button size="lg" className="w-full bg-ink text-white hover:bg-ink/90" onClick={handleConfirmAll} disabled={confirmingAll || readyCount === 0}>
          {confirmingAll ? <Icon name="spinner" size={16} className="animate-spin" /> : `Confirm all ready (${readyCount})`}
        </Button>
      </div>
    </div>
  );
}
