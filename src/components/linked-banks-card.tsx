"use client";

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink, type PlaidLinkOnSuccess } from "react-plaid-link";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaidItem } from "@/lib/types";

/**
 * Mounted only once a link token is ready (docs/Bank Sync Addendum.md
 * §5), and opens Link from a real button click rather than auto-opening
 * inside a useEffect. That's a deliberate choice, not an oversight: an
 * effect-driven `open()` double-fires under React Strict Mode's dev-only
 * mount→unmount→remount cycle (confirmed live — Plaid's own
 * link-initialize.js logged "embedded more than once" and the flow never
 * completed), because a fresh component instance means a fresh "have I
 * already opened" ref. Calling `open()` from onClick has no such
 * ambiguity — a click only ever happens once per click.
 */
function PlaidLinkLauncher({ token, onSuccess, onExit }: { token: string; onSuccess: PlaidLinkOnSuccess; onExit: () => void }) {
  const { open, ready } = usePlaidLink({ token, onSuccess, onExit });

  return (
    <Button size="sm" onClick={() => open()} disabled={!ready} className="w-full">
      {ready ? "Continue to your bank" : <Icon name="spinner" size={14} className="animate-spin" />}
    </Button>
  );
}

const STATUS_LABEL: Record<PlaidItem["status"], string> = {
  active: "Connected",
  reauth_required: "Needs reconnection",
  error: "Error",
};

function formatLastSynced(iso: string | null): string {
  if (!iso) return "Never synced";
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "Synced just now";
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.round(hours / 24)}d ago`;
}

/** "Linked banks" section on the Accounts page (Bank Sync Addendum §8) — connect/reconnect/sync/disconnect, all against GET/POST /api/v1/plaid/*, never the client-side store (plaid_items has no RLS policies for the browser, see the Addendum's §4 security model). */
export function LinkedBanksCard({ householdId }: { householdId: string }) {
  const [items, setItems] = useState<PlaidItem[] | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [launcherKey, setLauncherKey] = useState(0);
  const [connecting, setConnecting] = useState(false);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);

  const refetchItems = useCallback(async () => {
    const res = await fetch(`/api/v1/plaid/items?householdId=${encodeURIComponent(householdId)}`);
    if (!res.ok) return;
    const { items: fetched } = await res.json();
    setItems(fetched);
  }, [householdId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v1/plaid/items?householdId=${encodeURIComponent(householdId)}`);
      if (!res.ok || cancelled) return;
      const { items: fetched } = await res.json();
      if (!cancelled) setItems(fetched);
    })();
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  async function startConnect(plaidItemId?: string) {
    setConnecting(true);
    try {
      const res = await fetch("/api/v1/plaid/link-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, plaidItemId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't start bank linking.");
        return;
      }
      setLauncherKey((k) => k + 1);
      setLinkToken(data.linkToken);
    } finally {
      setConnecting(false);
    }
  }

  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    async (publicToken) => {
      setLinkToken(null);
      if (!publicToken) return; // reconnect/update-mode success carries no new public_token to exchange — the existing item's already-stored access_token is what gets used again
      toast.loading("Connecting your bank…", { id: "plaid-connect" });
      const res = await fetch("/api/v1/plaid/exchange-public-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, publicToken }),
      });
      const data = await res.json();
      toast.dismiss("plaid-connect");
      if (!res.ok) {
        toast.error(data.error ?? "Couldn't finish linking that bank.");
        return;
      }
      toast.success(`Connected ${data.institutionName ?? "your bank"} — ${data.accountCount} account${data.accountCount === 1 ? "" : "s"} added`);
      refetchItems();
    },
    [householdId, refetchItems]
  );

  async function handleSync(item: PlaidItem) {
    setBusyItemId(item.id);
    try {
      const res = await fetch("/api/v1/plaid/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, plaidItemId: item.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error("Couldn't sync — the bank may need reconnecting.");
      } else {
        toast.success("Synced");
      }
      await refetchItems();
    } finally {
      setBusyItemId(null);
    }
  }

  async function handleDisconnect(item: PlaidItem) {
    setBusyItemId(item.id);
    try {
      const res = await fetch("/api/v1/plaid/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, plaidItemId: item.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? "Couldn't disconnect.");
        return;
      }
      toast.success(`Disconnected ${item.institutionName ?? "that bank"}`);
      await refetchItems();
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Linked banks</p>
        <Button variant="outline" size="sm" onClick={() => startConnect()} disabled={connecting}>
          {connecting ? <Icon name="spinner" size={14} className="animate-spin" /> : "Connect a bank"}
        </Button>
      </div>

      {linkToken && (
        <div className="mb-3 rounded-2xl border border-border bg-white p-3">
          <PlaidLinkLauncher key={launcherKey} token={linkToken} onSuccess={handleSuccess} onExit={() => setLinkToken(null)} />
        </div>
      )}

      {items && items.length > 0 && (
        <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-white shadow-sm">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-item-title font-medium text-ink">{item.institutionName ?? "Connected bank"}</p>
                <p
                  className={cn(
                    "truncate text-caption",
                    item.status === "active" ? "text-muted-foreground" : "text-danger"
                  )}
                >
                  {STATUS_LABEL[item.status]} · {formatLastSynced(item.lastSyncedAt)}
                </p>
              </div>
              {item.status === "reauth_required" ? (
                <Button size="sm" variant="outline" onClick={() => startConnect(item.id)} disabled={connecting}>
                  Reconnect
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => handleSync(item)} disabled={busyItemId === item.id}>
                  {busyItemId === item.id ? <Icon name="spinner" size={14} className="animate-spin" /> : "Sync now"}
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Disconnect ${item.institutionName ?? "bank"}`}
                onClick={() => handleDisconnect(item)}
                disabled={busyItemId === item.id}
              >
                <Icon name="trash" size={16} className="text-danger" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
