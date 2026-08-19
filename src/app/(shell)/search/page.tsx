"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { categoryAccentClass } from "@/lib/category";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToScannedReceiptLineItem, type ScannedReceiptLineItemRow } from "@/lib/supabase/mappers";
import { useInventoryStore } from "@/lib/store";
import { searchInventory, searchFinance, type SearchResult } from "@/lib/search";
import { accountTypeIcon } from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScannedReceiptLineItem } from "@/lib/types";

type Domain = "all" | "inventory" | "finance";

export default function SearchPage() {
  return (
    <Suspense>
      <SearchPageInner />
    </Suspense>
  );
}

function SearchPageInner() {
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const [domain, setDomain] = useState<Domain>(() => {
    const d = searchParams.get("domain");
    return d === "inventory" || d === "finance" ? d : "all";
  });
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const tags = useInventoryStore((s) => s.tags);
  const transactions = useInventoryStore((s) => s.transactions);
  const accounts = useInventoryStore((s) => s.accounts);
  const financeCategories = useInventoryStore((s) => s.financeCategories);

  const [lineItemsByTransaction, setLineItemsByTransaction] = useState<Record<string, ScannedReceiptLineItem[]>>({});

  // Same bulk-fetch-once pattern the Transactions list already uses for its
  // own "search by item name" filter — scanned_receipt_line_items isn't
  // kept in the global store on purpose, so this is the one extra fetch
  // Search needs beyond what's already loaded. Adds itemized-receipt
  // matching ("milk" finds the Costco run it was on) on top of plain
  // merchant/description/category text — not required for Finance results
  // to work at all, just richer once it lands.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      const receiptScanIds = transactions.filter((t) => t.source === "receipt_scan" && !t.trashedAt).map((t) => t.id);
      const grouped: Record<string, ScannedReceiptLineItem[]> = {};
      if (receiptScanIds.length > 0) {
        const { data } = await getSupabaseBrowserClient().from("scanned_receipt_line_items").select("*").in("transaction_id", receiptScanIds);
        for (const row of (data ?? []) as ScannedReceiptLineItemRow[]) {
          const item = rowToScannedReceiptLineItem(row);
          if (!item.transactionId) continue;
          (grouped[item.transactionId] ??= []).push(item);
        }
      }
      if (!cancelled) setLineItemsByTransaction(grouped);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [transactions]);

  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // `autoFocus` below already fires immediately on mount and is enough on
    // desktop, but arriving here is always a client-side route change (from
    // the bottom nav's Search tab, or the dashboard's decoy search bar) —
    // iOS Safari only opens the on-screen keyboard for a focus() call that
    // lands within its "recently interacted" window, and a focus fired at
    // the exact instant of mount, before the route transition's paint has
    // settled, quietly loses that window (cursor/caret shows, keyboard
    // doesn't). Firing a second focus() one frame later — after the browser
    // has actually painted the new page — is the fix that's held up in
    // practice for this exact "focus survives, keyboard doesn't" case.
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, []);

  const inventoryResults = useMemo(() => searchInventory(query, items, containers, locations, tags), [query, items, containers, locations, tags]);
  const financeResults = useMemo(
    () => searchFinance(query, transactions, accounts, financeCategories, lineItemsByTransaction),
    [query, transactions, accounts, financeCategories, lineItemsByTransaction]
  );

  const combined: SearchResult[] = useMemo(() => {
    const pool: SearchResult[] = domain === "finance" ? financeResults : domain === "inventory" ? inventoryResults : [...inventoryResults, ...financeResults];
    return [...pool].sort((a, b) => b.score - a.score);
  }, [domain, inventoryResults, financeResults]);

  // Category chip filter only makes sense against inventory results —
  // finance results don't have an item category. Hidden entirely once
  // Finance-only results are in view, or once there's nothing to filter.
  const usedCategories = domain === "finance" ? [] : Array.from(new Set(inventoryResults.map((r) => r.item.category)));
  const filteredResults =
    categoryFilter && domain !== "finance" ? combined.filter((r) => r.kind === "item" && r.item.category === categoryFilter) : combined;

  const hasAnyResults = inventoryResults.length > 0 || financeResults.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <SearchBar ref={inputRef} value={query} onChange={setQuery} autoFocus className="flex-1" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <FilterChip label="All" active={domain === "all"} onClick={() => setDomain("all")} />
        <FilterChip label="Inventory" active={domain === "inventory"} onClick={() => setDomain("inventory")} />
        <FilterChip label="Finance" active={domain === "finance"} onClick={() => setDomain("finance")} />
      </div>

      {usedCategories.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <FilterChip label="All categories" active={categoryFilter === null} onClick={() => setCategoryFilter(null)} />
          {usedCategories.map((cat) => (
            <FilterChip key={cat} label={cat} active={categoryFilter === cat} onClick={() => setCategoryFilter(cat)} />
          ))}
        </div>
      )}

      {query.trim() === "" ? (
        <EmptyState
          icon="search"
          title="Search your household"
          description="Try an item name, a vendor, an account, or a location like “garage.”"
        />
      ) : filteredResults.length === 0 ? (
        <EmptyState
          icon="search"
          title={`No matches for "${query}"`}
          description={
            hasAnyResults
              ? "Nothing in this domain — try “All” to search everywhere."
              : "Check the spelling, or try a broader term — searches also match categories, tags, vendors, and accounts."
          }
        />
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-2">
            {filteredResults.map((r) => (
              <SearchResultRow key={`${r.kind}-${r.kind === "item" ? r.item.id : r.kind === "transaction" ? r.transaction.id : r.account.id}`} result={r} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SearchResultRow({ result }: { result: SearchResult }) {
  if (result.kind === "item") {
    const { item, breadcrumbLabel } = result;
    return (
      <Link href={`/items/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-muted">
          <Icon name="box" size={20} className="text-ink" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{item.name}</p>
          <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
        </div>
        <span className={cn("h-1 w-6 shrink-0 rounded-full", categoryAccentClass(item.category))} />
      </Link>
    );
  }

  if (result.kind === "transaction") {
    const { transaction: t, matchedItemName } = result;
    return (
      <Link href={`/finance/transactions?transactionId=${t.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
        <IconChip icon="receipt" tone="muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{matchedItemName ?? t.merchant ?? t.description ?? "Transaction"}</p>
          <p className="truncate text-caption text-muted-foreground">
            {matchedItemName ? `${t.merchant ?? "Transaction"} · ` : ""}
            {formatShortDate(t.occurredAt)}
          </p>
        </div>
        <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
          {formatCurrency(t.amount, { showPositiveSign: true })}
        </span>
      </Link>
    );
  }

  const { account } = result;
  return (
    <Link href={`/finance/accounts/${account.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
      <IconChip icon={accountTypeIcon(account.type)} tone="muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-item-title font-medium text-ink">{account.name}</p>
        <p className="truncate text-caption text-muted-foreground">{account.institutionName ?? "Account"}</p>
      </div>
      <span className={cn("shrink-0 text-body font-semibold", account.currentBalance < 0 ? "text-money-negative-text" : "text-ink")}>
        {formatCurrency(account.currentBalance)}
      </span>
    </Link>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
        active ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
      )}
    >
      {label}
    </button>
  );
}
