"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { useInventoryStore } from "@/lib/store";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Item ↔ transaction linking picker (Household Ledger Implementation Plan
 * Workstream 3, PRD `docs/v4 - Enhanced Features` §25). Shared by every
 * "Link to item" / "Link a purchase" entry point (Transaction Detail,
 * Receipt Review, Item Detail's own Purchase section) rather than
 * duplicated per screen — same search-and-pick shape, just searching
 * items vs. transactions depending on `mode`.
 *
 * PRD §25 is explicit this is *assisted, opportunistic* matching, not
 * automatic: candidates whose date falls near `referenceDate` are sorted
 * first and labeled "Suggested," but nothing is ever picked without the
 * user tapping it themselves — `referenceDate` only re-orders the list.
 */

const NEARBY_DAYS = 7;

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

interface PickerRow {
  id: string;
  title: string;
  subtitle: string;
  amountLabel: string | null;
  suggested: boolean;
  /** Used only to sort by proximity to `referenceDate` — an item's createdAt or a transaction's occurredAt. */
  sortDate: string;
}

interface LinkPurchaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "item": search inventory items (used from the finance side). "transaction": search transactions (used from Item Detail). */
  mode: "item" | "transaction";
  /** The other side's date — a transaction's occurredAt when mode="item", an item's createdAt when mode="transaction" — used only to sort likely candidates first. */
  referenceDate?: string | null;
  /** Ids already linked to this side, hidden from the list so re-linking the same pair isn't offered as a fresh option. */
  excludeIds?: string[];
  onPick: (result: { id: string; suggested: boolean }) => void;
}

export function LinkPurchaseSheet({ open, onOpenChange, mode, referenceDate, excludeIds, onPick }: LinkPurchaseSheetProps) {
  const [query, setQuery] = useState("");
  const items = useInventoryStore((s) => s.items);
  const transactions = useInventoryStore((s) => s.transactions);
  const accounts = useInventoryStore((s) => s.accounts);
  const excluded = useMemo(() => new Set(excludeIds ?? []), [excludeIds]);

  const rows = useMemo<PickerRow[]>(() => {
    const q = query.trim().toLowerCase();

    const unsorted: PickerRow[] =
      mode === "item"
        ? items
            .filter((it) => it.status === "active" && !excluded.has(it.id))
            .filter((it) => !q || it.name.toLowerCase().includes(q))
            .map((it) => ({
              id: it.id,
              title: it.name,
              subtitle: it.category,
              amountLabel: null,
              suggested: !!referenceDate && daysBetween(it.createdAt, referenceDate) <= NEARBY_DAYS,
              sortDate: it.createdAt,
            }))
        : transactions
            .filter((t) => !t.trashedAt && !excluded.has(t.id))
            .filter((t) => !q || (t.merchant ?? t.description ?? "").toLowerCase().includes(q))
            .map((t) => ({
              id: t.id,
              title: t.merchant ?? t.description ?? "Transaction",
              subtitle: `${formatDate(t.occurredAt)} · ${accounts.find((a) => a.id === t.accountId)?.name ?? "—"}`,
              amountLabel: formatCurrency(t.amount, { showPositiveSign: true }),
              suggested: !!referenceDate && daysBetween(t.occurredAt, referenceDate) <= NEARBY_DAYS,
              sortDate: t.occurredAt,
            }));

    return unsorted.sort((a, b) => {
      if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
      if (referenceDate) return daysBetween(a.sortDate, referenceDate) - daysBetween(b.sortDate, referenceDate);
      return a.title.localeCompare(b.title);
    });
  }, [mode, query, items, transactions, accounts, excluded, referenceDate]);

  const suggested = rows.filter((r) => r.suggested);
  const rest = rows.filter((r) => !r.suggested);

  function pick(row: PickerRow) {
    onPick({ id: row.id, suggested: row.suggested });
    setQuery("");
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) setQuery(""); onOpenChange(v); }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">
            {mode === "item" ? "Link to an item" : "Link a purchase"}
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          <div className="relative">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "item" ? "Search your inventory…" : "Search by vendor…"}
              className="h-11 pl-9"
            />
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={mode === "item" ? "box" : "receipt"}
              title={mode === "item" ? "No items found" : "No transactions found"}
              description={query ? "Try a different search." : mode === "item" ? "Scan or add an item first." : "Nothing to link yet."}
            />
          ) : (
            <div className="flex flex-col gap-3">
              {suggested.length > 0 && (
                <PickerGroup label="Suggested — near this purchase's date" rows={suggested} onPick={pick} />
              )}
              <PickerGroup label={suggested.length > 0 ? "All" : undefined} rows={rest} onPick={pick} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PickerGroup({ label, rows, onPick }: { label?: string; rows: PickerRow[]; onPick: (row: PickerRow) => void }) {
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {label && <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">{label}</p>}
      <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onPick(row)}
            className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-muted/60"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-ink">{row.title}</p>
              <p className="truncate text-caption text-muted-foreground">{row.subtitle}</p>
            </div>
            {row.amountLabel && <span className="shrink-0 text-body font-medium text-ink">{row.amountLabel}</span>}
            <Icon name="chevronRight" size={16} className="shrink-0 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
