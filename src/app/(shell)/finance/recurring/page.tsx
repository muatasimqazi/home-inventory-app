"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { IconChip } from "@/components/icon-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RecurringBillFormSheet } from "@/components/recurring-bill-form-sheet";
import { useInventoryStore } from "@/lib/store";
import { upcomingRecurringBills, daysUntil } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";
import { useRemountKey } from "@/hooks/use-remount-key";

export default function RecurringBillsPage() {
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const accounts = useInventoryStore((s) => s.accounts);
  const financeCategories = useInventoryStore((s) => s.financeCategories);
  const members = useInventoryStore((s) => s.members);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const financeBillShares = useInventoryStore((s) => s.financeBillShares);
  const createRecurringBill = useInventoryStore((s) => s.createRecurringBill);
  const updateRecurringBill = useInventoryStore((s) => s.updateRecurringBill);
  const trashRecurringBill = useInventoryStore((s) => s.trashRecurringBill);
  const shareRecurringBill = useInventoryStore((s) => s.shareRecurringBill);
  const unshareRecurringBill = useInventoryStore((s) => s.unshareRecurringBill);

  const searchParams = useSearchParams();

  const [createOpen, setCreateOpen] = useState(false);
  const [createKey, bumpCreateKey] = useRemountKey();
  // Deep-link from the Home/Finance dashboard's "Upcoming bills" widget
  // (?billId=...) — same read-once-via-lazy-initializer convention as
  // Transactions' own ?transactionId= deep link.
  const [editingId, setEditingId] = useState<string | null>(() => searchParams.get("billId"));
  const [trashConfirmId, setTrashConfirmId] = useState<string | null>(null);

  const bills = upcomingRecurringBills(recurringBills);
  const otherMembers = members.filter((m) => m.userId !== currentUserId);
  const editingBill = recurringBills.find((b) => b.id === editingId);
  const editingShares = financeBillShares.filter((s) => s.billId === editingId);

  function applySharing(billId: string, isPersonal: boolean, nextIds: string[], previousShares: { sharedWithUserId: string }[]) {
    if (!isPersonal) {
      for (const s of previousShares) unshareRecurringBill(billId, s.sharedWithUserId);
      return;
    }
    const previousIds = new Set(previousShares.map((s) => s.sharedWithUserId));
    const nextSet = new Set(nextIds);
    for (const id of nextSet) if (!previousIds.has(id)) shareRecurringBill(billId, id);
    for (const id of previousIds) if (!nextSet.has(id)) unshareRecurringBill(billId, id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Recurring Bills</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Add manually, or detect subscriptions from a statement.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/finance/recurring/import"
            aria-label="Import from statement"
            className="tap-target flex size-11 items-center justify-center rounded-md border border-border bg-white text-ink"
          >
            <Icon name="upload" size={18} />
          </Link>
          <Button size="icon-lg" className="rounded-md" onClick={() => { bumpCreateKey(); setCreateOpen(true); }} aria-label="Add recurring bill">
            <Icon name="plus" size={18} />
          </Button>
        </div>
      </div>

      {bills.length === 0 ? (
        <EmptyState icon="repeat" title="No recurring bills" description="Track mortgage payments, subscriptions, and other regular bills." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
          {bills.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-4 py-3.5">
              <button type="button" onClick={() => setEditingId(b.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                <IconChip icon="repeat" tone="muted" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-item-title font-medium text-ink">{b.name}</p>
                    {b.ownerUserId !== null && <Badge className="bg-badge-purple-bg text-badge-purple-text">Personal</Badge>}
                  </div>
                  <p className="truncate text-caption text-muted-foreground">
                    {b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1)} · Due in {daysUntil(b.nextDueDate)} days
                  </p>
                </div>
              </button>
              <span className="shrink-0 text-body font-semibold text-ink">{formatCurrency(b.expectedAmount)}</span>
              <button type="button" onClick={() => setTrashConfirmId(b.id)} aria-label={`Trash ${b.name}`} className="shrink-0 text-muted-foreground">
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <RecurringBillFormSheet
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        accounts={accounts}
        categories={financeCategories}
        otherMembers={otherMembers}
        onSubmit={(values) => {
          const bill = createRecurringBill({ ...values, ownerUserId: values.isPersonal ? currentUserId : null });
          if (values.isPersonal) for (const userId of values.sharedWithUserIds) shareRecurringBill(bill.id, userId);
          toast.success(`Added ${bill.name}`);
        }}
      />

      {editingBill && (
        <RecurringBillFormSheet
          open={!!editingId}
          onOpenChange={(open) => !open && setEditingId(null)}
          initial={editingBill}
          accounts={accounts}
          categories={financeCategories}
          otherMembers={otherMembers}
          initialSharedWithUserIds={editingShares.map((s) => s.sharedWithUserId)}
          onSubmit={(values) => {
            updateRecurringBill(editingBill.id, {
              name: values.name,
              expectedAmount: values.expectedAmount,
              frequency: values.frequency,
              nextDueDate: values.nextDueDate,
              categoryId: values.categoryId,
              accountId: values.accountId,
              ownerUserId: values.isPersonal ? (editingBill.ownerUserId ?? currentUserId) : null,
            });
            applySharing(editingBill.id, values.isPersonal, values.sharedWithUserIds, editingShares);
            toast.success("Recurring bill updated");
          }}
        />
      )}

      <ConfirmDialog
        open={!!trashConfirmId}
        onOpenChange={(open) => !open && setTrashConfirmId(null)}
        title="Move this recurring bill to Trash?"
        description="Restorable for 30 days from Trash."
        confirmLabel="Move to Trash"
        icon="trash"
        onConfirm={() => {
          if (trashConfirmId) {
            trashRecurringBill(trashConfirmId);
            setEditingId(null);
            setTrashConfirmId(null);
          }
        }}
      />
    </div>
  );
}
