"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Button } from "@/components/ui/button";
import { AskConversationEntry } from "@/components/ask-conversation-entry";
import { LoadMoreButton } from "@/components/load-more-button";
import { useAskConversation } from "@/hooks/use-ask-conversation";
import { usePaginated } from "@/hooks/use-paginated";
import { useAutoFocusVisible } from "@/hooks/use-autofocus-visible";
import { categoryAccentClass } from "@/lib/category";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToScannedReceiptLineItem, type ScannedReceiptLineItemRow } from "@/lib/supabase/mappers";
import { useInventoryStore } from "@/lib/store";
import { searchInventory, searchContainers, searchFinance, searchNotes, searchTasks, type SearchResult } from "@/lib/search";
import { PhotoThumb } from "@/components/photo-thumb";
import { accountTypeIcon, activeLocations } from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ScannedReceiptLineItem } from "@/lib/types";
import {
  loadReferenceItems,
  matchReferenceLocation,
  suggestReferenceItemsAcrossCatalog,
  type ReferenceInventoryItem,
} from "@/lib/reference/starter-inventory";

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
  const notes = useInventoryStore((s) => s.notes);
  const tasks = useInventoryStore((s) => s.tasks);
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  // Same question -> answer -> references flow as the global Ask widget
  // (hooks/use-ask-conversation.ts) — "we want search to function same as
  // ask" — rather than Search staying pure keyword-filter-only. Keyword
  // results (below) stay instant and free; asking is opt-in per query via
  // the "Ask AI" row so most searches never pay for a model call.
  const { entries: askEntries, ask, confirmPendingAction, cancelPendingAction } = useAskConversation(householdId);

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

  // useAutoFocusVisible's own raf-deferred focus() is the fix for this
  // page's original bug (arriving here is always a client-side route
  // change — from the bottom nav's Search tab, or the dashboard's decoy
  // search bar — and a focus() fired at the exact instant of mount, before
  // the route transition's paint has settled, quietly loses iOS's
  // "recently interacted" window: cursor/caret shows, keyboard doesn't).
  // It also now scrolls the bar into view once the keyboard's actually
  // open, which plain `autoFocus` never did on its own either.
  const inputRef = useRef<HTMLInputElement>(null);
  useAutoFocusVisible(inputRef);

  // Reference-catalog ("Common items") lazy load. Unlike the Add Item
  // form's typeahead — which defers loadReferenceItems() to first focus on
  // its Name field, since most visits to that form never touch typeahead —
  // this route's entire purpose is "the user is about to type a query," so
  // loading the ~220KB catalog once on mount avoids "Common items" popping
  // in a beat after the real results on someone's very first search here.
  // Still a dynamic import behind loadReferenceItems's own module-scope
  // cache, so the ~220KB item list stays its own chunk rather than bloating
  // this route's eagerly-loaded bundle (see starter-inventory.ts's header
  // comment).
  const [referenceItems, setReferenceItems] = useState<ReferenceInventoryItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadReferenceItems().then((items) => {
      if (!cancelled) setReferenceItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const inventoryResults = useMemo(() => searchInventory(query, items, containers, locations, tags), [query, items, containers, locations, tags]);
  // Own result kind, own pool — a container is a real thing you open (its
  // own detail page), not an attribute of an item result the way its name
  // already was via items' own breadcrumb matching. Kept separate from
  // inventoryResults (not merged into one array) so usedCategories below
  // can keep mapping over item results only without a kind guard.
  const containerResults = useMemo(() => searchContainers(query, containers, locations, items), [query, containers, locations, items]);
  const financeResults = useMemo(
    () => searchFinance(query, transactions, accounts, financeCategories, lineItemsByTransaction),
    [query, transactions, accounts, financeCategories, lineItemsByTransaction]
  );
  // Notes isn't "inventory" or "finance" — only folded into the "all" tab
  // (no dedicated Notes filter chip yet, see 0050_notes.sql's planning doc).
  const noteResults = useMemo(() => searchNotes(query, notes), [query, notes]);
  const taskResults = useMemo(() => searchTasks(query, tasks), [query, tasks]);

  const combined: SearchResult[] = useMemo(() => {
    const inventoryPool = [...inventoryResults, ...containerResults];
    const pool: SearchResult[] =
      domain === "finance" ? financeResults : domain === "inventory" ? inventoryPool : [...inventoryPool, ...financeResults, ...noteResults, ...taskResults];
    return [...pool].sort((a, b) => b.score - a.score);
  }, [domain, inventoryResults, containerResults, financeResults, noteResults, taskResults]);

  // Category chip filter only makes sense against item results — finance
  // results don't have an item category, and neither do containers. Hidden
  // entirely once Finance-only results are in view, or once there's
  // nothing to filter.
  const usedCategories = domain === "finance" ? [] : Array.from(new Set(inventoryResults.map((r) => r.item.category)));
  const filteredResults =
    categoryFilter && domain !== "finance" ? combined.filter((r) => r.kind === "item" && r.item.category === categoryFilter) : combined;

  const hasAnyResults = inventoryResults.length > 0 || containerResults.length > 0 || financeResults.length > 0 || noteResults.length > 0 || taskResults.length > 0;
  const { visible: paginatedResults, hasMore, remaining, pageSize, loadMore } = usePaginated(filteredResults, `${domain}:${categoryFilter}:${query}`);

  // Names the household already has, active items only — exact
  // case-insensitive match, deliberately not the same loose bidirectional
  // substring containment matchReferenceLocation() uses for locations: a
  // household item genuinely named "Bag" would otherwise suppress every
  // reference item whose name merely contains "bag" ("Trash Bags",
  // "Freezer Bags", ...). Exact-name dedup is conservative — it can still
  // miss a real duplicate phrased slightly differently — but it can't
  // wrongly hide a suggestion the household doesn't actually have, which
  // matters more given the section's own "not yet in your inventory" label.
  const ownedItemNames = useMemo(() => new Set(items.filter((it) => it.status === "active").map((it) => it.name.trim().toLowerCase())), [items]);

  // "Common items" — reference-catalog matches, inventory-domain only (the
  // catalog has no finance concept) so hidden under the Finance filter same
  // as the category chips above. Deliberately NOT filtered by the category
  // chip (categoryFilter): that chip's option list is derived from the
  // household's real inventoryResults, and a reference item's mapped
  // category may not even appear in it — applying it here would silently
  // hide otherwise-relevant suggestions rather than narrow them.
  const referenceResults = useMemo(() => {
    if (domain === "finance" || !referenceItems) return [];
    return suggestReferenceItemsAcrossCatalog(referenceItems, query, 24).filter((r) => !ownedItemNames.has(r.name.trim().toLowerCase()));
  }, [domain, referenceItems, query, ownedItemNames]);

  // Reverse of matchReferenceLocation: for each reference location name
  // that some real household Location resolves to (via the same
  // conservative exact/substring heuristic used everywhere else this
  // catalog is location-matched), remember that Location's id so a
  // suggestion's "Add" link can prefill it. First household Location to
  // match a given reference name wins on the rare case of more than one
  // matching (e.g. two locations both loosely matching "Closet").
  // activeLocations() — not the raw store slice — since a trashed
  // Location's id has no business being handed to /add as a destination;
  // every other placement-facing use of `locations` in this app already
  // filters this way (locations/page.tsx, move-sheet.tsx, ...).
  const referenceLocationToHouseholdId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const loc of activeLocations(locations)) {
      const matched = matchReferenceLocation(loc.name);
      if (matched && !(matched in map)) map[matched] = loc.id;
    }
    return map;
  }, [locations]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/dashboard" className="tap-target flex size-9 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
          <Icon name="arrowLeft" size={18} />
        </Link>
        <SearchBar ref={inputRef} value={query} onChange={setQuery} className="flex-1" />
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

      {query.trim() !== "" && (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => ask(query)}
          disabled={askEntries.some((e) => e.pending)}
        >
          <Icon name="ai" size={14} className="text-yellow" />
          Ask AI: &ldquo;{query.trim()}&rdquo;
        </Button>
      )}

      {askEntries.length > 0 && (
        <div className="flex flex-col gap-3">
          {askEntries.map((entry) => (
            <AskConversationEntry key={entry.id} entry={entry} onRetry={ask} onConfirm={confirmPendingAction} onCancel={cancelPendingAction} />
          ))}
        </div>
      )}

      {query.trim() === "" ? (
        <EmptyState
          icon="search"
          title="Search your household"
          description="Try an item name, a container or its Container ID, a vendor, an account, or a location like “garage.” Or ask a question, like “where did I keep my measuring tape?”"
        />
      ) : filteredResults.length === 0 ? (
        <EmptyState
          icon="search"
          title={`No matches for "${query}"`}
          description={
            hasAnyResults
              ? "Nothing in this domain — try “All” to search everywhere."
              : "Check the spelling, try a broader term, or ask AI above — searches also match categories, tags, vendors, and accounts."
          }
        />
      ) : (
        <>
          <p className="text-caption text-muted-foreground">
            {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"}
          </p>
          <div className="flex flex-col gap-2">
            {paginatedResults.map((r) => (
              <SearchResultRow
                key={`${r.kind}-${r.kind === "item" ? r.item.id : r.kind === "container" ? r.container.id : r.kind === "transaction" ? r.transaction.id : r.kind === "note" ? r.note.id : r.kind === "task" ? r.task.id : r.account.id}`}
                result={r}
              />
            ))}
          </div>
          {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
        </>
      )}

      {referenceResults.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-caption text-muted-foreground">
            Common items — not yet in your inventory, tap one to add it
          </p>
          <div className="flex flex-col gap-2">
            {referenceResults.map((r) => (
              <ReferenceResultRow
                key={`${r.location}:${r.name}`}
                refItem={r}
                locationId={referenceLocationToHouseholdId[r.location] ?? null}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A reference-catalog suggestion, not a real household result — same card
 * shape as SearchResultRow's item row (rounded-2xl/border/shadow) so it
 * reads as part of the same list idiom, but an IconChip "plus" instead of
 * the item row's box glyph signals "add this," not "open this," and there's
 * no category accent bar: category is shown, but only as secondary text
 * next to the reference location, per the brief's "subtly, not primary."
 * Links straight into the manual Add Item form, prefilled via the same
 * ?name=/?category=/?locationId= params that form already reads (added
 * alongside this feature) — locationId is included only when this
 * reference item's location resolved to a real household Location.
 */
function ReferenceResultRow({ refItem, locationId }: { refItem: ReferenceInventoryItem; locationId: string | null }) {
  const params = new URLSearchParams({ name: refItem.name, category: refItem.category });
  if (locationId) params.set("locationId", locationId);
  return (
    <Link href={`/add?${params.toString()}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
      <IconChip icon="plus" tone="muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-item-title font-medium text-ink">{refItem.name}</p>
        <p className="truncate text-caption text-muted-foreground">
          {refItem.location} · {refItem.category}
        </p>
      </div>
    </Link>
  );
}

function SearchResultRow({ result }: { result: SearchResult }) {
  if (result.kind === "item") {
    const { item, breadcrumbLabel } = result;
    return (
      <Link href={`/items/${item.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <PhotoThumb
          emoji={item.photoEmoji}
          coverPhotoPath={item.coverPhotoPath}
          className="size-11 shrink-0 rounded-md"
          emojiClassName="text-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{item.name}</p>
          <p className="truncate text-caption text-muted-foreground">{breadcrumbLabel}</p>
        </div>
        <span className={cn("h-1 w-6 shrink-0 rounded-full", categoryAccentClass(item.category))} />
      </Link>
    );
  }

  if (result.kind === "container") {
    const { container, breadcrumbLabel, itemCount } = result;
    return (
      <Link href={`/containers/${container.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <PhotoThumb
          emoji={container.coverPhotoEmoji ?? "📦"}
          coverPhotoPath={container.coverPhotoPath}
          className="size-11 shrink-0 rounded-md"
          emojiClassName="text-lg"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{container.name}</p>
          <p className="truncate text-caption text-muted-foreground">
            {breadcrumbLabel}
            {itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        {container.displayCode && (
          <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-micro font-semibold text-muted-foreground">
            {container.displayCode}
          </span>
        )}
      </Link>
    );
  }

  if (result.kind === "transaction") {
    const { transaction: t, matchedItemName } = result;
    return (
      <Link href={`/finance/transactions?transactionId=${t.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
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

  if (result.kind === "note") {
    const { note } = result;
    return (
      <Link href={`/notes/${note.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <IconChip icon="notebook" tone="muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{note.title || "Untitled note"}</p>
          <p className="truncate text-caption text-muted-foreground">{note.content.split("\n").find((l) => l.trim()) ?? "Note"}</p>
        </div>
        <Icon name={note.isShared ? "users" : "lock"} size={14} className="shrink-0 text-muted-foreground" />
      </Link>
    );
  }

  if (result.kind === "task") {
    const { task } = result;
    return (
      <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
        <IconChip icon="tasks" tone="muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-item-title font-medium text-ink">{task.title}</p>
          <p className="truncate text-caption text-muted-foreground">{formatShortDate(task.dueAt)}</p>
        </div>
      </Link>
    );
  }

  const { account } = result;
  return (
    <Link href={`/finance/accounts/${account.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm">
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
        active ? "border-ink-fill bg-ink-fill text-white" : "border-border bg-card text-ink"
      )}
    >
      {label}
    </button>
  );
}
