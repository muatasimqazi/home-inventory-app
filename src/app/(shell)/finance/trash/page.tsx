"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon, type IconName } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { useInventoryStore } from "@/lib/store";
import { daysUntil } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type EntityType = "account" | "transaction" | "category" | "recurring_bill";

interface TrashRow {
  type: EntityType;
  id: string;
  name: string;
  amount: number | null;
  trashedAt: string;
  purgeAfter: string;
}

const TYPE_LABEL: Record<EntityType, string> = { account: "Account", transaction: "Transaction", category: "Category", recurring_bill: "Bill" };
const TYPE_LABEL_PLURAL: Record<EntityType, string> = { account: "Accounts", transaction: "Transactions", category: "Categories", recurring_bill: "Bills" };
const TYPE_ICON: Record<EntityType, IconName> = { account: "wallet", transaction: "receipt", category: "pieChart", recurring_bill: "repeat" };

function rowKey(row: Pick<TrashRow, "type" | "id">): string {
  return `${row.type}-${row.id}`;
}

/** Finance's own Trash (docs/Personal Finance PRD.md §35: `/finance/trash`, distinct from the inventory Trash at /settings/trash) — same 30-day/restorable/Delete-Forever-only-from-Trash lifecycle (PRD §33), scoped to accounts/transactions/categories/recurring_bills. */
export default function FinanceTrashPage() {
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

  const [filter, setFilter] = useState<EntityType | "all">("all");
  const [pendingDelete, setPendingDelete] = useState<TrashRow | null>(null);

  const rows: TrashRow[] = [
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

  function restore(row: TrashRow) {
    if (row.type === "account") restoreAccount(row.id);
    if (row.type === "transaction") restoreTransaction(row.id);
    if (row.type === "category") restoreFinanceCategory(row.id);
    if (row.type === "recurring_bill") restoreRecurringBill(row.id);
    toast.success(`Restored ${row.name}`);
  }

  function deleteForever(row: TrashRow) {
    // Categories have no permanentlyDeleteX action exposed in the store —
    // trashed categories stay in Trash until the scheduled purge job
    // reaches them, matching how items/locations/containers do too (no
    // client-triggerable permanent-delete for anything except what already
    // exposes one). Only account/transaction/recurring_bill get a Delete
    // Forever button below (per TYPE_ICON keys that appear in this UI).
    if (row.type === "account") permanentlyDeleteAccount(row.id);
    if (row.type === "transaction") permanentlyDeleteTransaction(row.id);
    if (row.type === "recurring_bill") permanentlyDeleteRecurringBill(row.id);
    toast.success(`Permanently deleted ${row.name}`);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-screen-title font-semibold text-ink">Finance Trash</h1>
        <p className="mt-0.5 text-caption text-muted-foreground">Restore or permanently delete.</p>
      </div>

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
              {t === "all" ? "All" : TYPE_LABEL_PLURAL[t]}
            </button>
          ))}
        </div>
      )}

      {filteredRows.length === 0 ? (
        <EmptyState icon="trash" title="Trash is empty" description="Trashed accounts, transactions, categories, and bills show up here for 30 days." />
      ) : (
        <div className="flex flex-col gap-2">
          {filteredRows.map((row) => {
            const key = rowKey(row);
            return (
              <div key={key} className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-sm">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-surface-muted">
                  <Icon name={TYPE_ICON[row.type]} size={18} className="text-muted-foreground" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-body text-ink">{row.name}</p>
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-surface-muted px-1.5 py-0.5 text-micro text-muted-foreground">
                      {TYPE_LABEL[row.type]}
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
