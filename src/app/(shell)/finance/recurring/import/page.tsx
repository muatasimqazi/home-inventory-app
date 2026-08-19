"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useInventoryStore } from "@/lib/store";
import { visionProvider, VisionDetectionError } from "@/lib/ai";
import { detectRecurringCandidates, type RecurringCandidate } from "@/lib/recurring-detection";
import { resolveCategory } from "@/lib/receipt-resolution";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RecurringBillFrequency } from "@/lib/types";

type Stage = "upload" | "analyzing" | "review" | "creating" | "complete";

const FREQUENCY_LABELS: Record<RecurringBillFrequency, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

interface ReviewRow extends RecurringCandidate {
  include: boolean;
  categoryId: string | null;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Statement Import — upload a bank/card statement PDF, extract every
 * transaction line (lib/vision/extract-statement.ts), then run a purely
 * client-side, deterministic pass (lib/recurring-detection.ts) to find
 * which merchants recur on a real cadence with a consistent amount.
 * Never auto-creates a RecurringBill — same "AI extract, human review and
 * confirm" shape as receipt scanning and CSV import, not a new pattern.
 * Same stage-machine shape as finance/import (upload -> ... -> review ->
 * creating -> complete) for consistency, with "analyzing" swapped in for
 * CSV's "mapping" since there's no column mapping step here.
 */
export default function StatementImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accounts = useInventoryStore((s) => s.accounts);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const categoryRules = useInventoryStore((s) => s.categoryRules);
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const createRecurringBill = useInventoryStore((s) => s.createRecurringBill);

  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [transactionCount, setTransactionCount] = useState(0);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [showLongWaitHint, setShowLongWaitHint] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ created: number; skipped: number } | null>(null);

  const activeCategories = financeCategories.filter((c) => c.status === "active");

  async function handleFile(file: File) {
    setFileName(file.name);
    setError(null);
    setStage("analyzing");
    const longWaitTimer = setTimeout(() => setShowLongWaitHint(true), 8000);
    try {
      const dataUrl = await fileToDataUrl(file);
      const transactions = await visionProvider.extractStatement(dataUrl);
      setTransactionCount(transactions.length);
      const candidates = detectRecurringCandidates(transactions, recurringBills);
      setRows(
        candidates.map((c) => {
          const category = resolveCategory(c.merchantName, "merchant", categoryRules, financeCategories);
          return { ...c, include: !c.alreadyTracked, categoryId: category.categoryId };
        })
      );
      setStage("review");
    } catch (err) {
      const detectionError = err instanceof VisionDetectionError ? err : new VisionDetectionError("Couldn't analyze your statement. Please try again.", true);
      setError({ message: detectionError.message, retryable: detectionError.retryable });
    } finally {
      clearTimeout(longWaitTimer);
      setShowLongWaitHint(false);
    }
  }

  function updateRow(id: string, patch: Partial<ReviewRow>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  async function runCreate() {
    setStage("creating");
    const toCreate = rows.filter((r) => r.include);
    for (let i = 0; i < toCreate.length; i++) {
      const r = toCreate[i];
      createRecurringBill({
        name: r.merchantName,
        expectedAmount: r.expectedAmount,
        frequency: r.frequency,
        nextDueDate: r.nextDueDate,
        categoryId: r.categoryId,
        accountId: accountId || null,
        ownerUserId: null, // shared by default, same as manual creation via RecurringBillFormSheet
      });
      setProgress(Math.round(((i + 1) / toCreate.length) * 100));
      await new Promise((res) => setTimeout(res, 15));
    }
    setSummary({ created: toCreate.length, skipped: rows.length - toCreate.length });
    setStage("complete");
    toast.success(`Added ${toCreate.length} recurring bill${toCreate.length === 1 ? "" : "s"}`);
  }

  function reset() {
    setStage("upload");
    setFileName("");
    setRows([]);
    setTransactionCount(0);
    setError(null);
    setProgress(0);
    setSummary(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/finance/recurring" className="text-caption font-medium text-muted-foreground">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Import from Statement</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Upload a bank/card statement — subscriptions and other recurring charges get detected automatically.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">
          Add an account first — detected bills get attached to one.
        </p>
      ) : (
        <>
          {stage === "upload" && (
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1 block text-caption text-muted-foreground">Account this statement is for</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="h-11 w-full">
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
              </div>
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleFile(file);
                }}
                className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-white p-12 text-center"
              >
                <Icon name="file" size={28} className="text-muted-foreground" />
                <p className="text-body font-semibold text-ink">Drop statement PDF here</p>
                <p className="text-caption text-muted-foreground">Every page gets read — no need to split a multi-page statement first.</p>
                <Button onClick={() => fileInputRef.current?.click()}>Choose file</Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}

          {stage === "analyzing" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-12 shadow-sm">
              {error ? (
                <>
                  <div className="flex size-14 items-center justify-center rounded-full bg-danger/10">
                    <Icon name="danger" size={26} className="text-danger" />
                  </div>
                  <p className="text-item-title font-semibold text-ink">Couldn&apos;t analyze your statement</p>
                  <p className="text-center text-body text-muted-foreground">{error.message}</p>
                  <div className="flex gap-2">
                    {error.retryable && (
                      <Button onClick={() => fileInputRef.current?.click()}>Try again</Button>
                    )}
                    <Button variant="outline" onClick={reset}>
                      Back
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <Icon name="spinner" size={28} className="animate-spin text-ink" />
                  <p className="text-body text-ink">Reading {fileName}…</p>
                  <p className="text-caption text-muted-foreground">
                    {showLongWaitHint ? "A long statement can take a little longer — hang tight." : "Finding every transaction and checking for recurring patterns."}
                  </p>
                </>
              )}
            </div>
          )}

          {stage === "review" && (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
              <p className="text-caption text-muted-foreground">
                {transactionCount} transaction{transactionCount === 1 ? "" : "s"} found · {rows.length} recurring pattern{rows.length === 1 ? "" : "s"} detected
              </p>

              {rows.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border p-6 text-center text-caption text-muted-foreground">
                  No recurring charges stood out on this statement — nothing repeated on a regular cadence with a consistent amount.
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  {rows.map((r) => (
                    <div key={r.id} className={cn("flex flex-col gap-2 rounded-xl border p-3", r.alreadyTracked ? "border-border bg-surface-muted" : "border-border bg-white")}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={(e) => updateRow(r.id, { include: e.target.checked })}
                          className="mt-1 size-4 shrink-0"
                          aria-label={`Include ${r.merchantName}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-body font-medium text-ink">{r.merchantName}</p>
                            {r.alreadyTracked && <span className="shrink-0 rounded-full bg-badge-orange-bg px-1.5 py-0.5 text-micro font-medium text-badge-orange-text">Already tracked</span>}
                          </div>
                          <p className="text-caption text-muted-foreground">
                            Seen {r.occurrenceCount}× · last on {formatShortDate(r.lastOccurrence)}
                          </p>
                        </div>
                      </div>
                      {r.include && (
                        <div className="grid grid-cols-2 gap-2 pl-7 sm:grid-cols-4">
                          <div>
                            <label className="mb-1 block text-micro text-muted-foreground">Amount</label>
                            <Input
                              type="number"
                              step="0.01"
                              value={r.expectedAmount}
                              onChange={(e) => updateRow(r.id, { expectedAmount: Number(e.target.value) })}
                              className="h-9 text-caption"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-micro text-muted-foreground">Frequency</label>
                            <Select value={r.frequency} onValueChange={(v) => updateRow(r.id, { frequency: v as RecurringBillFrequency })}>
                              <SelectTrigger className="h-9 w-full text-caption">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <label className="mb-1 block text-micro text-muted-foreground">Category</label>
                            <Select value={r.categoryId ?? "__none"} onValueChange={(v) => updateRow(r.id, { categoryId: v === "__none" ? null : v })}>
                              <SelectTrigger className="h-9 w-full text-caption">
                                <SelectValue placeholder="Uncategorized" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none">Uncategorized</SelectItem>
                                {activeCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" size="lg" onClick={reset}>
                  Back
                </Button>
                <Button size="lg" onClick={runCreate} disabled={rows.every((r) => !r.include)}>
                  Add {rows.filter((r) => r.include).length} recurring bill{rows.filter((r) => r.include).length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}

          {stage === "creating" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-white p-12 shadow-sm">
              <Icon name="spinner" size={28} className="animate-spin text-ink" />
              <p className="text-body text-ink">Adding… {progress}%</p>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full bg-yellow transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {stage === "complete" && summary && (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-badge-green-bg text-badge-green-text">
                  <Icon name="check" size={20} />
                </div>
                <div>
                  <p className="text-item-title font-medium text-ink">Import complete</p>
                  <p className="text-caption text-muted-foreground">
                    {summary.created} recurring bill{summary.created === 1 ? "" : "s"} added
                    {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/finance/recurring" className="tap-target flex h-11 flex-1 items-center justify-center rounded-md border border-border text-body font-medium text-ink">
                  View recurring bills
                </Link>
                <Button size="lg" className="flex-1 bg-ink text-white hover:bg-ink/90" onClick={reset}>
                  Import another statement
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
