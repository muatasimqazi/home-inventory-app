"use client";

import { useCallback, useState } from "react";
import type { PlaidLinkOnSuccess } from "react-plaid-link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { PlaidLinkLauncher, formatLastSynced } from "@/components/linked-banks-card";
import { formatCurrency, formatShortDate } from "@/lib/format";
import type { Account, CreditCardLiability } from "@/lib/types";

const APR_TYPE_LABEL: Record<string, string> = {
  purchase_apr: "Purchase APR",
  cash_apr: "Cash Advance APR",
  balance_transfer_apr: "Balance Transfer APR",
  special: "Promotional APR",
};

function aprLabel(aprType: string): string {
  return APR_TYPE_LABEL[aprType] ?? aprType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Credit card APR/statement details via Plaid's Liabilities product
 * (user question: "for each credit card, is it possible to get its
 * interest rate from plaid" — this is that answer, surfaced on the
 * account detail page). Plaid-sourced only, no manual-entry path — omits
 * itself entirely for a non-Plaid card rather than showing an empty/dash
 * state, matching LinkedBanksCard's own established posture.
 *
 * Three states: not Plaid-linked (renders nothing), Plaid-linked but no
 * Liabilities consent/data yet (a "Connect for interest rate info"
 * prompt — reuses the exact update-mode Link + PlaidLinkLauncher flow
 * LinkedBanksCard's own "Reconnect" button uses, just triggered from a
 * healthy item rather than a reauth_required one), and data present.
 */
export function CreditCardLiabilityCard({ account, liability }: { account: Account; liability: CreditCardLiability | null }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [launcherKey, setLauncherKey] = useState(0);
  const [connecting, setConnecting] = useState(false);

  const startConnect = useCallback(async () => {
    if (!account.plaidItemId) return;
    setConnecting(true);
    try {
      const res = await fetch("/api/v1/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId: account.householdId, plaidItemId: account.plaidItemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't start connecting.");
        return;
      }
      setLauncherKey((k) => k + 1);
      setLinkToken(data.linkToken);
    } finally {
      setConnecting(false);
    }
  }, [account.householdId, account.plaidItemId]);

  // Update-mode Link success carries no new public_token to exchange
  // (same as LinkedBanksCard's own reconnect flow) — the consent grant
  // alone doesn't trigger a sync anywhere else, so a sync is kicked off
  // explicitly here to actually fetch the newly-consented Liabilities
  // data right away, rather than waiting for the next webhook/cron.
  const handleSuccess: PlaidLinkOnSuccess = useCallback(async () => {
    setLinkToken(null);
    if (!account.plaidItemId) return;
    toast.loading("Fetching your interest rate…", { id: "liabilities-sync" });
    const res = await fetch("/api/v1/plaid/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId: account.householdId, plaidItemId: account.plaidItemId }),
    });
    toast.dismiss("liabilities-sync");
    if (!res.ok) {
      toast.error("Connected, but couldn't sync yet. It'll catch up shortly.");
      return;
    }
    toast.success("Connected — interest rate info will appear shortly.");
    // The new credit_card_liabilities row arrives via Realtime once the
    // sync above finishes writing it — no manual refetch needed here.
  }, [account.householdId, account.plaidItemId]);

  if (!account.plaidItemId) return null;

  const purchaseApr = liability ? (liability.aprs.find((a) => a.aprType === "purchase_apr") ?? liability.aprs[0]) : undefined;
  const otherAprs = liability && purchaseApr ? liability.aprs.filter((a) => a !== purchaseApr) : [];

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-sm">
      <p className="mb-3 text-caption font-medium tracking-wide text-muted-foreground uppercase">Credit Card Details</p>

      {!liability ? (
        linkToken ? (
          <PlaidLinkLauncher key={launcherKey} token={linkToken} onSuccess={handleSuccess} onExit={() => setLinkToken(null)} />
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-caption text-muted-foreground">Connect this card to see its interest rate, statement balance, and payment due date.</p>
            <Button size="sm" variant="outline" onClick={startConnect} disabled={connecting}>
              {connecting ? <Icon name="spinner" size={14} className="animate-spin" /> : "Connect for interest rate info"}
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {liability.isOverdue && (
            <div className="flex items-center gap-1.5 rounded-lg bg-money-negative-bg px-3 py-2 text-caption font-medium text-money-negative-text">
              <Icon name="danger" size={14} />
              Payment overdue
            </div>
          )}

          {purchaseApr && (
            <div>
              <p className="text-caption text-muted-foreground">{aprLabel(purchaseApr.aprType)}</p>
              <p className="text-display font-semibold text-ink">{purchaseApr.aprPercentage.toFixed(2)}%</p>
              {otherAprs.length > 0 && (
                <div className="mt-2 flex flex-col gap-1">
                  {otherAprs.map((a) => (
                    <div key={a.aprType} className="flex items-center justify-between text-caption text-muted-foreground">
                      <span>{aprLabel(a.aprType)}</span>
                      <span className="font-medium text-ink">{a.aprPercentage.toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-4 border-t border-border pt-3">
            <div>
              <p className="text-caption text-muted-foreground">Last statement</p>
              <p className="text-body font-medium text-ink">{liability.lastStatementBalance !== null ? formatCurrency(liability.lastStatementBalance) : "—"}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Min. payment</p>
              <p className="text-body font-medium text-ink">{liability.minimumPaymentAmount !== null ? formatCurrency(liability.minimumPaymentAmount) : "—"}</p>
            </div>
            <div>
              <p className="text-caption text-muted-foreground">Due date</p>
              <p className="text-body font-medium text-ink">{liability.nextPaymentDueDate ? formatShortDate(liability.nextPaymentDueDate) : "—"}</p>
            </div>
          </div>

          <p className="text-micro text-muted-foreground">{formatLastSynced(liability.lastSyncedAt)}</p>
        </div>
      )}
    </div>
  );
}
