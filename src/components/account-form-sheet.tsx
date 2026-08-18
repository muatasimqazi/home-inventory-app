"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import type { Account, AccountType, Member } from "@/lib/types";
import { ACCOUNT_TYPE_LABEL } from "@/lib/selectors";

const ACCOUNT_TYPES: AccountType[] = ["checking", "savings", "credit_card", "loan", "mortgage", "cash", "investment"];

interface AccountFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing account pre-fills every field; omit for "New Account". */
  initial?: Account;
  /** Every other household member — the pool the Share-with picker offers. Excludes the current user (you don't share with yourself). */
  otherMembers: Member[];
  /** Which of otherMembers already have a grant, when editing a personal account (ignored for a new account — nothing to share yet). */
  initialSharedWithUserIds?: string[];
  onSubmit: (values: {
    name: string;
    type: AccountType;
    institutionName: string | null;
    cardLastFour: string | null;
    startingBalance: number;
    /** false = joint/household (ownerUserId stays null). true = personal, private by default — caller resolves this to the actual owner (itself, on create; unchanged, on edit) since the form has no reason to know the current user's id. */
    isPersonal: boolean;
    /** Only meaningful when isPersonal is true — who to grant/revoke access for, diffed against initialSharedWithUserIds by the caller. */
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

/** Create/edit sheet for Account — name, type, institution, card last-4, starting balance, and the Ownership + Share-with pair that's the whole point of the 2026-08-18 privacy-model pass (docs/Personal Finance Addendum.md "Privacy model"). */
export function AccountFormSheet({
  open,
  onOpenChange,
  initial,
  otherMembers,
  initialSharedWithUserIds = [],
  onSubmit,
}: AccountFormSheetProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<AccountType>(initial?.type ?? "checking");
  const [institutionName, setInstitutionName] = useState(initial?.institutionName ?? "");
  const [cardLastFour, setCardLastFour] = useState(initial?.cardLastFour ?? "");
  const [startingBalance, setStartingBalance] = useState(initial ? String(initial.startingBalance) : "0");
  const [isPersonal, setIsPersonal] = useState(initial ? initial.ownerUserId !== null : false);
  const [sharedWithUserIds, setSharedWithUserIds] = useState<string[]>(initialSharedWithUserIds);
  const [error, setError] = useState<string | null>(null);

  function toggleShare(userId: string) {
    setSharedWithUserIds((cur) => (cur.includes(userId) ? cur.filter((id) => id !== userId) : [...cur, userId]));
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const parsedBalance = Number(startingBalance);
    if (Number.isNaN(parsedBalance)) {
      setError("Starting balance must be a number.");
      return;
    }
    onSubmit({
      name: name.trim(),
      type,
      institutionName: institutionName.trim() || null,
      cardLastFour: cardLastFour.trim() || null,
      startingBalance: parsedBalance,
      isPersonal,
      sharedWithUserIds: isPersonal ? sharedWithUserIds : [],
    });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">{initial ? "Edit Account" : "New Account"}</SheetTitle>
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
              placeholder="e.g. Household Checking"
              className="h-11"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Type</label>
            <div className="flex flex-wrap gap-1.5">
              {ACCOUNT_TYPES.map((t) => (
                <PillButton key={t} active={type === t} onClick={() => setType(t)}>
                  {ACCOUNT_TYPE_LABEL[t]}
                </PillButton>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Institution</label>
            <Input value={institutionName} onChange={(e) => setInstitutionName(e.target.value)} placeholder="e.g. Chase, Amex, Wells Fargo" className="h-11" />
          </div>

          {(type === "credit_card" || type === "checking" || type === "savings") && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Card last 4 digits (optional)</label>
              <Input
                value={cardLastFour}
                onChange={(e) => setCardLastFour(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                className="h-11"
                inputMode="numeric"
              />
              <p className="mt-1 text-micro text-muted-foreground">Used to auto-match a scanned receipt to this account.</p>
            </div>
          )}

          <div>
            <label className="mb-1 block text-caption text-muted-foreground">Starting balance</label>
            <Input value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} placeholder="$0.00" className="h-11" inputMode="decimal" />
          </div>

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

          {isPersonal && (
            <div>
              <label className="mb-1 block text-caption text-muted-foreground">Share with</label>
              {otherMembers.length === 0 ? (
                <p className="text-caption text-muted-foreground">No other household members to share with yet.</p>
              ) : (
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
              )}
              <p className="mt-1 text-micro text-muted-foreground">
                {sharedWithUserIds.length === 0
                  ? "Only you can see this account."
                  : `Only you and ${sharedWithUserIds.length} other member${sharedWithUserIds.length === 1 ? "" : "s"} can see this account.`}
              </p>
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
