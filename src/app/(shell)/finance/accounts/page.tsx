"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AccountFormSheet } from "@/components/account-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { accountTypeIcon, groupAccountsByType } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRemountKey } from "@/hooks/use-remount-key";

export default function AccountsListPage() {
  const accounts = useInventoryStore((s) => s.accounts);
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const createAccount = useInventoryStore((s) => s.createAccount);
  const shareAccount = useInventoryStore((s) => s.shareAccount);
  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, bumpCreateKey] = useRemountKey();

  function openCreate() {
    bumpCreateKey();
    setCreateOpen(true);
  }

  const groups = groupAccountsByType(accounts);
  const otherMembers = members.filter((m) => m.userId !== currentUserId);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Accounts</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Checking, savings, cards, loans & investments.</p>
        </div>
        <Button size="icon-lg" className="rounded-md" onClick={openCreate} aria-label="Add account">
          <Icon name="plus" size={18} />
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="No accounts yet"
          description="Add your first account — checking, savings, a credit card, whatever you want to track."
          action={
            <Button size="lg" onClick={openCreate}>
              Add an account
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 text-caption font-medium tracking-wide text-muted-foreground uppercase">{group.label}</p>
              <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
                {group.accounts.map((a) => (
                  <Link key={a.id} href={`/finance/accounts/${a.id}`} className="flex items-center gap-3 px-4 py-3.5">
                    <IconChip icon={accountTypeIcon(a.type)} tone="muted" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-item-title font-medium text-ink">{a.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {a.institutionName}
                        {a.cardLastFour ? ` · ...${a.cardLastFour}` : ""}
                      </p>
                      {a.ownerUserId !== null && (
                        <Badge className="mt-1 bg-badge-purple-bg text-badge-purple-text">Personal</Badge>
                      )}
                    </div>
                    <span className={cn("shrink-0 text-body font-semibold", a.currentBalance < 0 ? "text-money-negative-text" : "text-ink")}>
                      {formatCurrency(a.currentBalance)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <AccountFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        otherMembers={otherMembers}
        onSubmit={(values) => {
          const account = createAccount({
            name: values.name,
            type: values.type,
            institutionName: values.institutionName,
            cardLastFour: values.cardLastFour,
            startingBalance: values.startingBalance,
            ownerUserId: values.isPersonal ? currentUserId : null,
          });
          if (values.isPersonal) {
            for (const userId of values.sharedWithUserIds) shareAccount(account.id, userId);
          }
        }}
      />
    </div>
  );
}
