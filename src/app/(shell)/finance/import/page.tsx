"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useInventoryStore } from "@/lib/store";
import { parseCsv } from "@/lib/csv";
import { findDuplicateTransaction } from "@/lib/csv-import-resolution";
import { formatCurrency, formatDate } from "@/lib/format";
import { sortByLabel } from "@/lib/selectors";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

type Stage = "upload" | "mapping" | "review" | "importing" | "complete";

const CSV_FIELDS = [
  { key: "date", label: "Date", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "description", label: "Description / Merchant", required: true },
] as const;

type FieldKey = (typeof CSV_FIELDS)[number]["key"];

interface CandidateRow {
  rowIndex: number;
  occurredAt: string;
  amount: number;
  description: string;
  duplicateOf: Transaction | null;
  skip: boolean;
}

function parseAmount(raw: string): number {
  // Handles "$1,234.56", "(42.50)" (parens = negative, common in bank
  // exports), and a plain "-42.50" the same way.
  const trimmed = raw.trim();
  const isParenNegative = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,]/g, "");
  const value = Number(cleaned);
  if (Number.isNaN(value)) return NaN;
  return isParenNegative ? -Math.abs(value) : value;
}

function parseDate(raw: string): string | null {
  const trimmed = raw.trim();
  // Bare "YYYY-MM-DD" (a common bank-export shape) is parsed as UTC
  // midnight per the Date spec — every other format (MM/DD/YYYY, "Aug 10,
  // 2026", ...) is parsed as local time instead. Left alone, a UTC-midnight
  // date displays as the day *before* in any timezone behind UTC — the
  // exact bug a Playwright review caught (CSV said 8/10, the review screen
  // showed 8/9). Same noon-anchoring fix already used in
  // transaction-form-sheet.tsx/recurring-bill-form-sheet.tsx for the same
  // reason, applied only to the one format shape that actually needs it.
  const isoDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  const d = new Date(isoDateOnly ? `${trimmed}T12:00:00` : trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * CSV Import wizard (docs/Personal Finance PRD.md §20/§30: "upload → map
 * columns → review flagged duplicates → confirm — the same shape as
 * Shohaz's existing CSV import"). Modeled directly on
 * settings/import/page.tsx's stage machine, with the one real addition
 * that page doesn't need: a duplicate-detection review step
 * (findDuplicateTransaction, PRD §32.3's resolved heuristic).
 */
export default function FinanceCsvImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const accounts = useInventoryStore((s) => s.accounts);
  const sortedAccounts = sortByLabel(accounts, (a) => a.name);
  const transactions = useInventoryStore((s) => s.transactions);
  const createTransaction = useInventoryStore((s) => s.createTransaction);
  const recordCsvImportBatch = useInventoryStore((s) => s.recordCsvImportBatch);

  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [accountId, setAccountId] = useState(sortedAccounts[0]?.id ?? "");
  const [mapping, setMapping] = useState<Record<FieldKey, string>>({ date: "", amount: "", description: "" });
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<{ imported: number; skipped: number } | null>(null);

  function handleFile(file: File) {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      if (parsed.length === 0) return;
      const [head, ...body] = parsed;
      setHeaders(head);
      setRows(body);
      const guess: Record<FieldKey, string> = { date: "", amount: "", description: "" };
      for (const field of CSV_FIELDS) {
        const match = head.find((h) => h.toLowerCase().includes(field.key) || (field.key === "description" && /merchant|payee|name/i.test(h)));
        if (match) guess[field.key] = match;
      }
      setMapping(guess);
      setStage("mapping");
    };
    reader.readAsText(file);
  }

  function columnIndex(field: FieldKey) {
    return headers.indexOf(mapping[field]);
  }
  function rowValue(row: string[], field: FieldKey) {
    const idx = columnIndex(field);
    return idx >= 0 ? (row[idx] ?? "").trim() : "";
  }

  function buildCandidatesAndReview() {
    const built: CandidateRow[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const dateRaw = rowValue(row, "date");
      const amountRaw = rowValue(row, "amount");
      const description = rowValue(row, "description");
      const occurredAt = parseDate(dateRaw);
      const amount = parseAmount(amountRaw);
      if (!occurredAt || Number.isNaN(amount) || !description) continue; // unparseable rows are silently excluded from the candidate set, not imported as garbage

      const duplicateOf = findDuplicateTransaction({ accountId, amount, occurredAt, description }, transactions);
      built.push({ rowIndex: i, occurredAt, amount, description, duplicateOf, skip: duplicateOf !== null });
    }
    setCandidates(built);
    setStage("review");
  }

  function toggleSkip(rowIndex: number) {
    setCandidates((cs) => cs.map((c) => (c.rowIndex === rowIndex ? { ...c, skip: !c.skip } : c)));
  }

  async function runImport() {
    setStage("importing");
    const toImport = candidates.filter((c) => !c.skip);
    for (let i = 0; i < toImport.length; i++) {
      const c = toImport[i];
      createTransaction({
        accountId,
        occurredAt: c.occurredAt,
        amount: c.amount,
        type: c.amount < 0 ? "expense" : "income",
        merchant: c.description,
        description: c.description,
        source: "csv_import",
      });
      setProgress(Math.round(((i + 1) / toImport.length) * 100));
      await new Promise((r) => setTimeout(r, 15));
    }

    try {
      await recordCsvImportBatch({
        accountId,
        fileName,
        columnMapping: mapping,
        rowCount: candidates.length,
        duplicateCount: candidates.filter((c) => c.duplicateOf !== null).length,
      });
    } catch (error) {
      console.error("Couldn't record CSV import batch:", error);
    }

    setSummary({ imported: toImport.length, skipped: candidates.length - toImport.length });
    setStage("complete");
    toast.success(`Imported ${toImport.length} transaction${toImport.length === 1 ? "" : "s"}`);
  }

  function reset() {
    setStage("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({ date: "", amount: "", description: "" });
    setCandidates([]);
    setProgress(0);
    setSummary(null);
  }

  const duplicateCount = candidates.filter((c) => c.duplicateOf !== null).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Import from CSV</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Bring in transactions from a bank export.</p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-caption text-muted-foreground">
          Add an account first — CSV rows import into one specific account.
        </p>
      ) : (
        <>
          {stage === "upload" && (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-12 text-center"
            >
              <Icon name="file" size={28} className="text-muted-foreground" />
              <p className="text-body font-semibold text-ink">Drop CSV file here</p>
              <Button onClick={() => fileInputRef.current?.click()}>Choose file</Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFile(file);
                }}
              />
            </div>
          )}

          {stage === "mapping" && (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="text-caption text-muted-foreground">{rows.length} rows found in {fileName}.</p>

              <div>
                <label className="mb-1 block text-caption text-muted-foreground">Import into account</label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue placeholder="Choose an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CSV_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="mb-1 block text-caption text-muted-foreground">
                      {field.label}
                      {field.required && <span className="text-danger"> *</span>}
                    </label>
                    <Select value={mapping[field.key] || "__none"} onValueChange={(v) => setMapping((m) => ({ ...m, [field.key]: v === "__none" ? "" : v }))}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Not mapped</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>

              <Button size="lg" disabled={!mapping.date || !mapping.amount || !mapping.description || !accountId} onClick={buildCandidatesAndReview} className="self-start">
                Review import
              </Button>
            </div>
          )}

          {stage === "review" && (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-caption text-muted-foreground">{candidates.length} rows parsed.</p>
                {duplicateCount > 0 && (
                  <p className="flex items-center gap-1 text-caption font-medium text-badge-orange-text">
                    <Icon name="needsReview" size={14} /> {duplicateCount} possible duplicate{duplicateCount === 1 ? "" : "s"} — unchecked by default
                  </p>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Import</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {candidates.map((c) => (
                      <TableRow key={c.rowIndex} className={c.duplicateOf ? "bg-badge-orange-bg/40" : undefined}>
                        <TableCell>
                          <input type="checkbox" checked={!c.skip} onChange={() => toggleSkip(c.rowIndex)} className="size-4" aria-label="Import this row" />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(c.occurredAt)}</TableCell>
                        <TableCell>{c.description}</TableCell>
                        <TableCell className={cn(c.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>{formatCurrency(c.amount, { showPositiveSign: true })}</TableCell>
                        <TableCell className="text-caption text-muted-foreground">{c.duplicateOf ? "Possible duplicate" : "New"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="lg" onClick={() => setStage("mapping")}>
                  Back
                </Button>
                <Button size="lg" onClick={runImport} disabled={candidates.every((c) => c.skip)}>
                  Import {candidates.filter((c) => !c.skip).length} transaction{candidates.filter((c) => !c.skip).length === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          )}

          {stage === "importing" && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-12 shadow-sm">
              <Icon name="spinner" size={28} className="animate-spin text-ink" />
              <p className="text-body text-ink">Importing… {progress}%</p>
              <div className="h-2 w-64 overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full bg-yellow transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {stage === "complete" && summary && (
            <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-full bg-badge-green-bg text-badge-green-text">
                  <Icon name="check" size={20} />
                </div>
                <div>
                  <p className="text-item-title font-medium text-ink">Import complete</p>
                  <p className="text-caption text-muted-foreground">
                    {summary.imported} transaction{summary.imported === 1 ? "" : "s"} imported
                    {summary.skipped > 0 ? ` · ${summary.skipped} skipped` : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/finance/transactions"
                  className="tap-target flex h-11 flex-1 items-center justify-center rounded-md border border-border text-body font-medium text-ink"
                >
                  View transactions
                </Link>
                <Button size="lg" className="flex-1 bg-ink-fill text-white hover:bg-ink-fill/90" onClick={reset}>
                  Import another file
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
