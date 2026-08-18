"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { TransactionFormSheet } from "@/components/transaction-form-sheet";
import { TransactionDetailSheet } from "@/components/transaction-detail-sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useInventoryStore } from "@/lib/store";
import { displayCodeBadgeClasses } from "@/lib/badge-color";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

type Filter = "all" | "month" | "uncategorized";

function groupByDay(transactions: Transaction[]): [string, Transaction[]][] {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const map = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const d = new Date(t.occurredAt);
    const label =
      d.toDateString() === today
        ? "Today"
        : d.toDateString() === yesterday
          ? "Yesterday"
          : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const list = map.get(label) ?? [];
    list.push(t);
    map.set(label, list);
  }
  return Array.from(map.entries());
}

export default function TransactionsListPage() {
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const transactionAttachments = useInventoryStore((s) => s.transactionAttachments);
  const createTransaction = useInventoryStore((s) => s.createTransaction);
  const createLinkedTransactionPair = useInventoryStore((s) => s.createLinkedTransactionPair);
  const updateTransaction = useInventoryStore((s) => s.updateTransaction);
  const trashTransaction = useInventoryStore((s) => s.trashTransaction);

  const searchParams = useSearchParams();
  const defaultAccountId = searchParams.get("accountId") ?? undefined;

  const [filter, setFilter] = useState<Filter>("all");
  // Deep-link from Account Detail's "Add transaction" (?open=new&accountId=...)
  // — starts the create sheet already open, pre-filled with that account,
  // rather than landing on a list and requiring a second click to find
  // the "+" button. Read once via the useState initializer (not an
  // effect + setState, which would cost an extra render for no benefit
  // here — the query param never changes without a full navigation).
  const [createOpen, setCreateOpen] = useState(() => searchParams.get("open") === "new");
  const [editOpen, setEditOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);

  const active = transactions.filter((t) => !t.trashedAt);
  const now = new Date();
  const filtered =
    filter === "month"
      ? active.filter((t) => {
          const d = new Date(t.occurredAt);
          return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        })
      : filter === "uncategorized"
        ? active.filter((t) => !t.categoryId && (t.type === "expense" || t.type === "income" || t.type === "refund"))
        : active;

  const sorted = [...filtered].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  const groups = groupByDay(sorted);
  const detailTxn = transactions.find((t) => t.id === detailId) ?? null;
  const detailAccount = accounts.find((a) => a.id === detailTxn?.accountId);
  const detailCategory = financeCategories.find((c) => c.id === detailTxn?.categoryId);
  const detailAttachment = transactionAttachments.find((a) => a.transactionId === detailTxn?.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Transactions</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Every transaction across your accounts.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/finance/scan" className="tap-target flex size-11 items-center justify-center rounded-md bg-surface-muted text-ink" aria-label="Scan receipt">
            <Icon name="camera" size={18} />
          </Link>
          <Button size="icon-lg" className="rounded-md" onClick={() => setCreateOpen(true)} aria-label="Add transaction" disabled={accounts.length === 0}>
            <Icon name="plus" size={18} />
          </Button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {([
          ["all", "All"],
          ["month", "This month"],
          ["uncategorized", "Uncategorized"],
        ] as [Filter, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={cn(
              "tap-target shrink-0 rounded-full border px-3 py-1.5 text-caption font-medium",
              filter === value ? "border-ink bg-ink text-white" : "border-border bg-white text-ink"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {accounts.length === 0 ? (
        <EmptyState icon="receipt" title="Add an account first" description="Transactions belong to an account — add one from the Accounts tab to get started." />
      ) : sorted.length === 0 ? (
        <EmptyState icon="receipt" title="No transactions" description="Nothing matches this filter yet." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map(([day, entries]) => (
            <div key={day}>
              <p className="mb-1.5 text-caption font-medium tracking-wide text-muted-foreground uppercase">{day}</p>
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {entries.map((t) => {
                  const category = financeCategories.find((c) => c.id === t.categoryId);
                  return (
                    <button key={t.id} type="button" onClick={() => setDetailId(t.id)} className="flex items-center gap-3 px-4 py-3 text-left">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          {category ? (
                            <span className={cn("rounded-full border px-1.5 py-0.5 text-micro font-medium", displayCodeBadgeClasses(category.id))}>
                              {category.name}
                            </span>
                          ) : (
                            <span className="text-caption text-muted-foreground">Uncategorized</span>
                          )}
                        </div>
                      </div>
                      <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                        {formatCurrency(t.amount, { showPositiveSign: true })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <TransactionFormSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={financeCategories}
        defaultAccountId={defaultAccountId}
        onSubmitSingle={(values) => {
          createTransaction(values);
          toast.success("Transaction added");
        }}
        onSubmitTransfer={(values) => {
          createLinkedTransactionPair(values);
          toast.success("Transfer added");
        }}
      />

      <TransactionFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        accounts={accounts}
        categories={financeCategories}
        initial={detailTxn ?? undefined}
        onSubmitSingle={(values) => {
          if (detailTxn) updateTransaction(detailTxn.id, values);
          toast.success("Transaction updated");
        }}
        onSubmitTransfer={() => {
          /* editing never needs the transfer branch — initial is set, so TransactionFormSheet always takes the single-leg path */
        }}
      />

      <TransactionDetailSheet
        open={!!detailId && !editOpen}
        onOpenChange={(open) => !open && setDetailId(null)}
        transaction={detailTxn}
        account={detailAccount}
        category={detailCategory}
        attachment={detailAttachment}
        onEdit={() => setEditOpen(true)}
        onTrash={() => setTrashConfirmId(detailId)}
      />

      <ConfirmDialog
        open={!!trashConfirmId}
        onOpenChange={(open) => !open && setTrashConfirmId(null)}
        title="Move this transaction to Trash?"
        description="Restorable for 30 days from Trash. If it's one leg of a transfer, both legs move together."
        confirmLabel="Move to Trash"
        icon="trash"
        onConfirm={() => {
          if (trashConfirmId) {
            trashTransaction(trashConfirmId);
            setDetailId(null);
          }
        }}
      />
    </div>
  );
}
