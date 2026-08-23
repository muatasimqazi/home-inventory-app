"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { sortByLabel } from "@/lib/selectors";
import type { Account, FinanceCategory, Member, RecurringBill, RecurringBillFrequency } from "@/lib/types";

const FREQUENCIES: { value: RecurringBillFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Biweekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
];

interface RecurringBillFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: RecurringBill;
  accounts: Account[];
  categories: FinanceCategory[];
  otherMembers: Member[];
  initialSharedWithUserIds?: string[];
  onSubmit: (values: {
    name: string;
    expectedAmount: number;
    frequency: RecurringBillFrequency;
    nextDueDate: string;
    categoryId: string | null;
    accountId: string | null;
    isDebtPayment: boolean;
    isPersonal: boolean;
    sharedWithUserIds: string[];
  }) => void;
}

function PillButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-caption font-medium transition-colors",
        active ? "bg-yellow text-white" : "bg-surface-muted text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Same Ownership + Share-with pair as AccountFormSheet (Personal Finance Addendum, "Privacy model" — recurring_bills has the identical owner_user_id shape as accounts). */
export function RecurringBillFormSheet({
  open,
  onOpenChange,
  initial,
  accounts,
  categories,
  otherMembers,
  initialSharedWithUserIds = [],
  onSubmit,
}: RecurringBillFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [expectedAmount, setExpectedAmount] = useState(initial ? String(initial.expectedAmount) : "");
  const [frequency, setFrequency] = useState<RecurringBillFrequency>(initial?.frequency ?? "monthly");
  const [nextDueDate, setNextDueDate] = useState(initial ? initial.nextDueDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [isDebtPayment, setIsDebtPayment] = useState(initial?.isDebtPayment ?? false);
  const [isPersonal, setIsPersonal] = useState(initial ? initial.ownerUserId !== null : false);
  const [sharedWithUserIds, setSharedWithUserIds] = useState<string[]>(initialSharedWithUserIds);
  const [error, setError] = useState<string | null>(null);

  const activeCategories = sortByLabel(
    categories.filter((c) => c.status === "active"),
    (c) => c.name
  );
  const sortedAccounts = sortByLabel(accounts, (a) => a.name);

  function toggleShare(userId: string) {
    setSharedWithUserIds((cur) => (cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId]));
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const parsedAmount = Number(expectedAmount);
    if (!expectedAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    onSubmit({
      name: name.trim(),
      expectedAmount: parsedAmount,
      frequency,
      nextDueDate: new Date(`${nextDueDate}T12:00:00`).toISOString(),
      categoryId: categoryId || null,
      accountId: accountId || null,
      isDebtPayment,
      isPersonal,
      sharedWithUserIds: isPersonal ? sharedWithUserIds : [],
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{initial ? "Edit Recurring Bill" : "New Recurring Bill"}</SheetTitle>
        </SheetHeader>
        <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto px-4 pb-6">
          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. Mortgage payment"
              className="h-11"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Expected amount</label>
            <Input value={expectedAmount} onChange={(e) => setExpectedAmount(e.target.value)} placeholder="$0.00" className="h-11" inputMode="decimal" />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Frequency</label>
            <div className="flex flex-wrap gap-1.5">
              {FREQUENCIES.map((f) => (
                <PillButton key={f.value} active={frequency === f.value} onClick={() => setFrequency(f.value)}>
                  {f.label}
                </PillButton>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Next due date</label>
            <Input type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className="h-11" />
          </div>

          {categories.length > 0 && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Category (optional)</label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {accounts.length > 0 && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Account (optional)</label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-11 w-full">
                  <SelectValue placeholder="None" />
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
          )}

          <label className="flex items-start gap-2 text-caption text-ink">
            <Checkbox checked={isDebtPayment} onCheckedChange={(v) => setIsDebtPayment(v === true)} className="mt-0.5" />
            <span>
              This bill is a credit card, loan, or mortgage payment
              <span className="block text-micro text-muted-foreground">
                Groups it under Credit Cards &amp; Loans and sends a push reminder the day it&apos;s due, on top of the usual few-days-ahead one. Separate from the Account field above, which is just where the charge is paid from.
              </span>
            </span>
          </label>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Ownership</label>
            <div className="flex gap-1.5">
              <PillButton active={!isPersonal} onClick={() => setIsPersonal(false)}>
                Joint (household)
              </PillButton>
              <PillButton active={isPersonal} onClick={() => setIsPersonal(true)}>
                Personal (private)
              </PillButton>
            </div>
          </div>

          {isPersonal && otherMembers.length > 0 && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Share with</label>
              <div className="flex flex-wrap gap-1.5">
                {otherMembers.map((m) => {
                  const shared = sharedWithUserIds.includes(m.userId);
                  return (
                    <button
                      key={m.userId}
                      type="button"
                      onClick={() => toggleShare(m.userId)}
                      className={cn(
                        "flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-caption font-medium",
                        shared ? "border-yellow bg-brand-100 text-ink" : "border-border bg-white text-ink"
                      )}
                    >
                      <Avatar size="sm">
                        <AvatarFallback className={shared ? "bg-yellow text-white" : undefined}>{m.displayName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      {m.displayName}
                      {shared && <Icon name="check" size={14} className="text-yellow" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {error && <p className="text-caption text-danger">{error}</p>}

          <Button size="lg" className="bg-ink text-white hover:bg-ink/90" onClick={handleSubmit}>
            Save
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
