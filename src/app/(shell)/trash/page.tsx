"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SearchBar } from "@/components/search-bar";
import { LoadMoreButton } from "@/components/load-more-button";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePaginated } from "@/hooks/use-paginated";
import { useInventoryStore } from "@/lib/store";
import { daysUntil } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One shared Trash, not two — previously /settings/trash (items/
 * containers/locations) and /finance/trash (accounts/transactions/
 * categories/recurring_bills) were separate routes with no link between
 * them, even though "everything pending permanent deletion" is one real
 * mental model for a user, not two. Each domain keeps its own panel
 * (different entity shapes, different action sets — Inventory's keeps
 * search + bulk-select, Finance's keeps its simpler per-row actions; not
 * forced into full feature parity just to share a page) behind top tabs,
 * rather than interleaving both domains' rows into one flat list the way
 * Activity's merge does — Trash rows carry real destructive actions
 * (Delete Forever) that are entity-type-specific enough that keeping each
 * domain's own list intact, just co-located, is the safer merge.
 */
export default function TrashPage() {
  const searchParams = useSearchParams();
  // Deep-linkable so each domain's own "Trash" link (desktop sidebar,
  // Finance hub, ...) lands on its own tab instead of always defaulting
  // to Inventory — read once via useState's initializer, not an effect,
  // since the param never changes without a full navigation.
  const [tab, setTab] = useState(() => (searchParams.get("tab") === "finance" ? "finance" : "inventory"));

  return (
    <Tabs value={tab} onValueChange={setTab} className="gap-4">
      <div className="flex items-center gap-2">
        <BackButton hideOnDesktop />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Trash</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Restore items or remove them permanently.</p>
        </div>
      </div>

      <TabsList>
        <TabsTrigger value="inventory">Inventory</TabsTrigger>
        <TabsTrigger value="finance">Finance</TabsTrigger>
      </TabsList>

      <TabsContent value="inventory">
        <InventoryTrashPanel />
      </TabsContent>
      <TabsContent value="finance">
        <FinanceTrashPanel />
      </TabsContent>
    </Tabs>
  );
}

// ---------------------------------------------------------------------------
// Inventory panel — same body settings/trash/page.tsx had, just no longer
// its own route/header (both now live one level up, shared).
// ---------------------------------------------------------------------------

type InventoryEntityType = "item" | "container" | "location";

interface InventoryTrashRow {
  type: InventoryEntityType;
  id: string;
  name: string;
  emoji: string;
  trashedAt: string;
  purgeAfter: string;
}

const INVENTORY_TYPE_LABEL: Record<InventoryEntityType, string> = { item: "Item", container: "Container", location: "Location" };
const INVENTORY_TYPE_ICON: Record<InventoryEntityType, IconName> = { item: "tag", container: "archive", location: "box" };

function inventoryRowKey(row: Pick<InventoryTrashRow, "type" | "id">): string {
  return `${row.type}-${row.id}`;
}

function InventoryTrashPanel() {
  const items = useInventoryStore((s) => s.items);
  const containers = useInventoryStore((s) => s.containers);
  const locations = useInventoryStore((s) => s.locations);
  const restoreItem = useInventoryStore((s) => s.restoreItem);
  const permanentlyDeleteItem = useInventoryStore((s) => s.permanentlyDeleteItem);
  const restoreContainer = useInventoryStore((s) => s.restoreContainer);
  const permanentlyDeleteContainer = useInventoryStore((s) => s.permanentlyDeleteContainer);
  const restoreLocation = useInventoryStore((s) => s.restoreLocation);
  const permanentlyDeleteLocation = useInventoryStore((s) => s.permanentlyDeleteLocation);

  const [filter, setFilter] = useState<InventoryEntityType | "all">("all");
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<InventoryTrashRow | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const rows: InventoryTrashRow[] = [
    ...items
      .filter((it) => it.status === "trashed")
      .map((it) => ({ type: "item" as const, id: it.id, name: it.name, emoji: it.photoEmoji, trashedAt: it.trashedAt!, purgeAfter: it.permanentlyDeleteAfter! })),
    ...containers
      .filter((c) => c.status === "trashed")
      .map((c) => ({ type: "container" as const, id: c.id, name: c.name, emoji: c.coverPhotoEmoji ?? "📦", trashedAt: c.trashedAt!, purgeAfter: c.permanentlyDeleteAfter! })),
    ...locations
      .filter((l) => l.status === "trashed")
      .map((l) => ({ type: "location" as const, id: l.id, name: l.name, emoji: l.coverPhotoEmoji ?? "📦", trashedAt: l.trashedAt!, purgeAfter: l.permanentlyDeleteAfter! })),
  ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));

  const typeFilteredRows = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const filteredRows = query.trim()
    ? typeFilteredRows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
    : typeFilteredRows;

  // Bulk-action handlers below act on every individually selected row
  // regardless of how many "pages" have been revealed — selectedRows stays
  // derived from the full filteredRows, not the paginated window, so
  // Restore/Delete Forever never silently drops a selection made before
  // "Load more" was tapped again.
  const selectedRows = filteredRows.filter((r) => selected.has(inventoryRowKey(r)));
  const { visible: paginatedRows, hasMore, remaining, pageSize, loadMore } = usePaginated(filteredRows, `${filter}:${query}`);
  // "Select all" only ever means "everything currently on screen" though —
  // scoped to paginatedRows, not the full filtered set, same reasoning as
  // Transactions' own bulk-select.
  const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every((r) => selected.has(inventoryRowKey(r)));

  function restore(row: InventoryTrashRow) {
    if (row.type === "item") restoreItem(row.id);
    if (row.type === "container") restoreContainer(row.id);
    if (row.type === "location") restoreLocation(row.id);
    toast.success(`Restored ${row.name}`);
  }

  function deleteForever(row: InventoryTrashRow) {
    if (row.type === "item") permanentlyDeleteItem(row.id);
    if (row.type === "container") permanentlyDeleteContainer(row.id);
    if (row.type === "location") permanentlyDeleteLocation(row.id);
    toast.success(`Permanently deleted ${row.name}`);
  }

  function toggleSelected(key: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSelectAllVisible() {
    setSelected((s) => {
      if (allVisibleSelected) {
        const next = new Set(s);
        for (const r of paginatedRows) next.delete(inventoryRowKey(r));
        return next;
      }
      return new Set([...s, ...paginatedRows.map(inventoryRowKey)]);
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelected(new Set());
  }

  function bulkRestore() {
    const count = selectedRows.length;
    for (const row of selectedRows) restore(row);
    toast.success(`Restored ${count} item${count === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  function bulkDeleteForever() {
    const count = selectedRows.length;
    for (const row of selectedRows) deleteForever(row);
    toast.success(`Permanently deleted ${count} item${count === 1 ? "" : "s"}`);
    exitSelectMode();
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      {rows.length > 0 && (
        <div className="flex items-center gap-3">
          <SearchBar value={query} onChange={setQuery} placeholder="Search items, containers, locations..." className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}>
            {selectMode ? "Cancel" : "Select"}
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(["all", "item", "container", "location"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilter(t)}
                className={cn(
                  "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
                  filter === t ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
                )}
              >
                {t === "all" ? "All" : `${INVENTORY_TYPE_LABEL[t]}s`}
              </button>
            ))}
          </div>
          {selectMode && filteredRows.length > 0 && (
            <button type="button" onClick={toggleSelectAllVisible} className="shrink-0 text-caption font-medium text-ink underline underline-offset-2">
              {allVisibleSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState icon="trash" title="Trash is empty" description="Trashed items, containers, and locations show up here for 30 days before they're automatically deleted." />
      ) : (
        <div className="flex flex-col gap-2">
          {paginatedRows.map((row) => {
            const key = inventoryRowKey(row);
            const isSelected = selected.has(key);
            return (
              <div
                key={key}
                role={selectMode ? "button" : undefined}
                tabIndex={selectMode ? 0 : undefined}
                onClick={selectMode ? () => toggleSelected(key) : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-white p-3 shadow-sm",
                  isSelected ? "border-ink ring-1 ring-ink" : "border-border"
                )}
              >
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(key)}
                    onClick={(e) => e.stopPropagation()}
                    className="size-4 shrink-0"
                    aria-label={`Select ${row.name}`}
                  />
                )}
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-brand-100 text-xl">{row.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-body text-ink">{row.name}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                      <Icon name={INVENTORY_TYPE_ICON[row.type]} size={10} /> {INVENTORY_TYPE_LABEL[row.type]}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground">{daysUntil(row.purgeAfter)} days left</p>
                </div>
                {!selectMode && (
                  <>
                    <Button variant="secondary" size="icon-sm" aria-label="Restore" onClick={() => restore(row)} className="sm:hidden">
                      <Icon name="restore" size={14} />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => restore(row)} className="hidden sm:inline-flex">
                      <Icon name="restore" size={14} /> Restore
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Delete forever" onClick={() => setPendingDelete(row)}>
                      <Icon name="trash" size={16} className="text-danger" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
          {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
        </div>
      )}

      {selectMode && selected.size > 0 && (
        <div className="fixed inset-x-4 bottom-[calc(5.125rem+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-2xl bg-ink px-4 py-3 text-white shadow-lg md:bottom-4">
          <span className="text-body">{selected.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-white/30 bg-transparent text-white hover:bg-white/10" onClick={bulkRestore}>
              <Icon name="restore" size={14} /> Restore
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Icon name="trash" size={14} /> Delete Forever
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description={`This permanently deletes "${pendingDelete?.name}" and its photo. This cannot be undone.`}
        confirmLabel="Delete Forever"
        onConfirm={() => {
          if (pendingDelete) deleteForever(pendingDelete);
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        tone="danger"
        icon="danger"
        title={`Delete ${selected.size} item${selected.size === 1 ? "" : "s"} forever?`}
        description="This permanently deletes the selected items, containers, and/or locations (and their photos). This cannot be undone."
        confirmLabel="Delete Forever"
        onConfirm={bulkDeleteForever}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance panel — same body finance/trash/page.tsx had.
// ---------------------------------------------------------------------------

type FinanceEntityType = "account" | "transaction" | "category" | "recurring_bill";

interface FinanceTrashRow {
  type: FinanceEntityType;
  id: string;
  name: string;
  amount: number | null;
  trashedAt: string;
  purgeAfter: string;
}

const FINANCE_TYPE_LABEL: Record<FinanceEntityType, string> = { account: "Account", transaction: "Transaction", category: "Category", recurring_bill: "Bill" };
const FINANCE_TYPE_LABEL_PLURAL: Record<FinanceEntityType, string> = { account: "Accounts", transaction: "Transactions", category: "Categories", recurring_bill: "Bills" };
const FINANCE_TYPE_ICON: Record<FinanceEntityType, IconName> = { account: "wallet", transaction: "receipt", category: "pieChart", recurring_bill: "repeat" };

function financeRowKey(row: Pick<FinanceTrashRow, "type" | "id">): string {
  return `${row.type}-${row.id}`;
}

function FinanceTrashPanel() {
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const restoreAccount = useInventoryStore((s) => s.restoreAccount);
  const permanentlyDeleteAccount = useInventoryStore((s) => s.permanentlyDeleteAccount);
  const restoreTransaction = useInventoryStore((s) => s.restoreTransaction);
  const permanentlyDeleteTransaction = useInventoryStore((s) => s.permanentlyDeleteTransaction);
  const restoreFinanceCategory = useInventoryStore((s) => s.restoreFinanceCategory);
  const restoreRecurringBill = useInventoryStore((s) => s.restoreRecurringBill);
  const permanentlyDeleteRecurringBill = useInventoryStore((s) => s.permanentlyDeleteRecurringBill);

  const [filter, setFilter] = useState<FinanceEntityType | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<FinanceTrashRow | null>(null);

  const rows: FinanceTrashRow[] = [
    ...accounts
      .filter((a) => a.status === "trashed")
      .map((a) => ({ type: "account" as const, id: a.id, name: a.name, amount: a.currentBalance, trashedAt: a.trashedAt!, purgeAfter: a.permanentlyDeleteAfter! })),
    ...transactions
      .filter((t) => t.trashedAt)
      .map((t) => ({ type: "transaction" as const, id: t.id, name: t.merchant ?? t.description ?? "Transaction", amount: t.amount, trashedAt: t.trashedAt!, purgeAfter: t.permanentlyDeleteAfter! })),
    ...financeCategories
      .filter((c) => c.status === "trashed")
      .map((c) => ({ type: "category" as const, id: c.id, name: c.name, amount: null, trashedAt: c.trashedAt!, purgeAfter: c.permanentlyDeleteAfter! })),
    ...recurringBills
      .filter((b) => b.trashedAt)
      .map((b) => ({ type: "recurring_bill" as const, id: b.id, name: b.name, amount: b.expectedAmount, trashedAt: b.trashedAt!, purgeAfter: b.permanentlyDeleteAfter! })),
  ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));

  const filteredRows = filter === "all" ? rows : rows.filter((r) => r.type === filter);
  const { visible: paginatedRows, hasMore, remaining, pageSize, loadMore } = usePaginated(filteredRows, filter);

  function restore(row: FinanceTrashRow) {
    if (row.type === "account") restoreAccount(row.id);
    if (row.type === "transaction") restoreTransaction(row.id);
    if (row.type === "category") restoreFinanceCategory(row.id);
    if (row.type === "recurring_bill") restoreRecurringBill(row.id);
    toast.success(`Restored ${row.name}`);
  }

  function deleteForever(row: FinanceTrashRow) {
    if (row.type === "account") permanentlyDeleteAccount(row.id);
    if (row.type === "transaction") permanentlyDeleteTransaction(row.id);
    if (row.type === "recurring_bill") permanentlyDeleteRecurringBill(row.id);
    toast.success(`Permanently deleted ${row.name}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["all", "account", "transaction", "category", "recurring_bill"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setFilter(t)}
              className={cn(
                "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
                filter === t ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
              )}
            >
              {t === "all" ? "All" : FINANCE_TYPE_LABEL_PLURAL[t]}
            </button>
          ))}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState icon="trash" title="Trash is empty" description="Trashed accounts, transactions, categories, and bills show up here for 30 days." />
      ) : (
        <div className="flex flex-col gap-2">
          {paginatedRows.map((row) => {
            const key = financeRowKey(row);
            return (
              <div key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted">
                  <Icon name={FINANCE_TYPE_ICON[row.type]} size={18} className="text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-body text-ink">{row.name}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                      {FINANCE_TYPE_LABEL[row.type]}
                    </span>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    {daysUntil(row.purgeAfter)} days left{row.amount !== null ? ` · ${formatCurrency(row.amount)}` : ""}
                  </p>
                </div>
                <Button variant="secondary" size="icon-sm" aria-label="Restore" onClick={() => restore(row)} className="sm:hidden">
                  <Icon name="restore" size={14} />
                </Button>
                <Button variant="secondary" size="sm" onClick={() => restore(row)} className="hidden sm:inline-flex">
                  <Icon name="restore" size={14} /> Restore
                </Button>
                {row.type !== "category" && (
                  <Button variant="ghost" size="icon" aria-label="Delete forever" onClick={() => setPendingDelete(row)}>
                    <Icon name="trash" size={16} className="text-danger" />
                  </Button>
                )}
              </div>
            );
          })}
          {hasMore && <LoadMoreButton remaining={remaining} pageSize={pageSize} onClick={loadMore} />}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        tone="danger"
        icon="danger"
        title="Delete forever?"
        description={`This permanently deletes "${pendingDelete?.name}". This cannot be undone.`}
        confirmLabel="Delete Forever"
        onConfirm={() => {
          if (pendingDelete) deleteForever(pendingDelete);
        }}
      />
    </div>
  );
}
