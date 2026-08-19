"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AccountFormSheet } from "@/components/account-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { transactionsForAccount, ACCOUNT_TYPE_LABEL } from "@/lib/selectors";
import { formatCurrency, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AccountDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const accounts = useInventoryStore((s) => s.accounts);
  const transactions = useInventoryStore((s) => s.transactions);
  const members = useInventoryStore((s) => s.members);
  const financeAccountShares = useInventoryStore((s) => s.financeAccountShares);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const updateAccount = useInventoryStore((s) => s.updateAccount);
  const trashAccount = useInventoryStore((s) => s.trashAccount);
  const shareAccount = useInventoryStore((s) => s.shareAccount);
  const unshareAccount = useInventoryStore((s) => s.unshareAccount);

  const [editOpen, setEditOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);

  const account = accounts.find((a) => a.id === params.id);
  const otherMembers = members.filter((m) => m.userId !== currentUserId);
  const shares = financeAccountShares.filter((s) => s.accountId === params.id);
  const sharedWithNames = shares
    .map((s) => members.find((m) => m.userId === s.sharedWithUserId)?.displayName)
    .filter((n): n is string => !!n);

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-body font-medium text-ink">Account not found</p>
        <p className="text-caption text-muted-foreground">It may have been deleted, or you may not have access.</p>
      </div>
    );
  }

  const isOwner = account.ownerUserId === currentUserId;
  const isJoint = account.ownerUserId === null;
  const accountTransactions = transactionsForAccount(transactions, account.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => router.back()} aria-label="Back" className="tap-target flex size-9 items-center justify-center rounded-full bg-surface-muted">
          <Icon name="arrowLeft" size={18} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-screen-title font-semibold text-ink">{account.name}</h1>
        <button type="button" onClick={() => setEditOpen(true)} aria-label="Edit account" className="tap-target flex size-9 items-center justify-center rounded-full bg-surface-muted">
          <Icon name="edit" size={16} />
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
        <p className="text-caption text-muted-foreground">
          {account.institutionName}
          {account.cardLastFour ? ` · ...${account.cardLastFour}` : ""} · {ACCOUNT_TYPE_LABEL[account.type]}
        </p>
        <p className={cn("mt-1 text-3xl font-semibold", account.currentBalance < 0 ? "text-money-negative-text" : "text-ink")}>
          {formatCurrency(account.currentBalance)}
        </p>
        <div className="mt-3 flex items-center gap-4 border-t border-border pt-3">
          <div>
            <p className="text-caption text-muted-foreground">Available</p>
            <p className="text-body font-medium text-ink">{account.availableBalance !== null ? formatCurrency(account.availableBalance) : "—"}</p>
          </div>
          <div>
            <p className="text-caption text-muted-foreground">Starting balance</p>
            <p className="text-body font-medium text-ink">{formatCurrency(account.startingBalance)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1.5 border-t border-border pt-3">
          <Icon name={isJoint ? "users" : "lock"} size={14} className={isJoint ? "text-muted-foreground" : "text-badge-purple-text"} />
          {isJoint ? (
            <p className="text-caption text-muted-foreground">Joint · visible to everyone in the household</p>
          ) : (
            <p className="text-caption font-medium text-badge-purple-text">
              Personal{isOwner ? (sharedWithNames.length > 0 ? ` · Shared with ${sharedWithNames.join(", ")}` : " · Not shared") : ""}
            </p>
          )}
        </div>
        {isOwner && !isJoint && (
          <button type="button" onClick={() => setEditOpen(true)} className="mt-2 rounded-full bg-badge-purple-bg px-3 py-1 text-caption font-semibold text-badge-purple-text">
            Manage sharing
          </button>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-item-title font-semibold text-ink">Transactions</h2>
          <Link href={`/finance/transactions?open=new&accountId=${account.id}`} className="text-caption font-medium text-yellow">
            + Add
          </Link>
        </div>
        {accountTransactions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border bg-white p-4 text-center text-caption text-muted-foreground">No transactions yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
            {accountTransactions.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body font-medium text-ink">{t.merchant ?? t.description ?? "Transaction"}</p>
                  <p className="truncate text-caption text-muted-foreground">
                    {formatShortDate(t.occurredAt)} · {t.status === "pending" ? "Pending" : "Posted"}
                  </p>
                </div>
                <span className={cn("shrink-0 text-body font-semibold", t.amount < 0 ? "text-money-negative-text" : "text-badge-green-text")}>
                  {formatCurrency(t.amount, { showPositiveSign: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Button variant="outline" className="mt-2 border-danger/30 text-danger" onClick={() => setTrashConfirmOpen(true)}>
        <Icon name="trash" size={16} />
        Move to Trash
      </Button>

      <AccountFormSheet
        // Always mounted (open is just a prop here) — key on the record so
        // a rename-then-reopen-edit within the same page session reseeds
        // instead of showing the pre-edit values from first mount.
        key={account.id}
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={account}
        otherMembers={otherMembers}
        initialSharedWithUserIds={shares.map((s) => s.sharedWithUserId)}
        onSubmit={(values) => {
          updateAccount(account.id, {
            name: values.name,
            type: values.type,
            institutionName: values.institutionName,
            cardLastFour: values.cardLastFour,
            startingBalance: values.startingBalance,
            ownerUserId: values.isPersonal ? (account.ownerUserId ?? currentUserId) : null,
          });
          if (values.isPersonal) {
            const previousIds = new Set(shares.map((s) => s.sharedWithUserId));
            const nextIds = new Set(values.sharedWithUserIds);
            for (const userId of nextIds) if (!previousIds.has(userId)) shareAccount(account.id, userId);
            for (const userId of previousIds) if (!nextIds.has(userId)) unshareAccount(account.id, userId);
          } else if (shares.length > 0) {
            for (const s of shares) unshareAccount(account.id, s.sharedWithUserId);
          }
          toast.success("Account updated");
        }}
      />

      <ConfirmDialog
        open={trashConfirmOpen}
        onOpenChange={setTrashConfirmOpen}
        title="Move this account to Trash?"
        description="Its transactions move with it. Restorable for 30 days from Trash."
        confirmLabel="Move to Trash"
        icon="trash"
        onConfirm={() => {
          trashAccount(account.id);
          router.push("/finance/accounts");
        }}
      />
    </div>
  );
}
