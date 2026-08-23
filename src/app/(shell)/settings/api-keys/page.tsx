"use client";

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventoryStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ApiKey } from "@/lib/types";

const ENDPOINTS: { method: string; path: string; note: string }[] = [
  { method: "GET", path: "/locations", note: "List active locations" },
  { method: "POST", path: "/locations", note: "Create a location — { name, description? }" },
  { method: "GET", path: "/locations/:id", note: "Get one location" },
  { method: "PATCH", path: "/locations/:id", note: "Edit name/description" },
  { method: "GET", path: "/containers", note: "List active containers — ?locationId= optional" },
  { method: "POST", path: "/containers", note: "Create a container — { name, locationId, parentContainerId? }" },
  { method: "GET", path: "/containers/:id", note: "Get one container" },
  { method: "PATCH", path: "/containers/:id", note: "Edit, or move via locationId/parentContainerId" },
  { method: "GET", path: "/items", note: "List active items — ?locationId=&containerId=&category= optional" },
  { method: "POST", path: "/items", note: "Create an item — { name, category?, quantity?, notes?, locationId?, containerId? }" },
  { method: "GET", path: "/items/:id", note: "Get one item" },
  { method: "PATCH", path: "/items/:id", note: "Edit, move, or archive (status: \"active\" | \"archived\")" },
  { method: "DELETE", path: "/items/:id", note: "Move to Trash (recoverable 30 days)" },
];

/**
 * Real, working API keys (this used to be a pure UI mock — local
 * useState, a Math.random() "key" that was never persisted or checked
 * against anything). Generation is server-side (api/v1/api-keys — the
 * secret is minted and hashed there and shown here exactly once); listing
 * and revoking go through the normal store/RLS path like everything else
 * in the app, since those don't need to touch a raw secret at all.
 *
 * Owner-only end to end: api_keys' own RLS policies (0028_api_keys.sql)
 * mean a non-owner's fetch of this table always comes back empty, and the
 * generate route independently checks requireHouseholdOwner too — this
 * page's own isOwner gate is a third, purely cosmetic layer so a regular
 * member sees an explanation instead of a confusingly-empty list.
 */
export default function ApiKeysPage() {
  const isOwner = useInventoryStore((s) => s.members.find((m) => m.userId === s.currentUserId)?.role === "owner");
  const apiKeys = useInventoryStore((s) => s.apiKeys);
  const generateApiKey = useInventoryStore((s) => s.generateApiKey);
  const revokeApiKey = useInventoryStore((s) => s.revokeApiKey);

  const [newLabel, setNewLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [revealed, setRevealed] = useState<{ apiKey: ApiKey; secret: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  const activeKeys = apiKeys.filter((k) => !k.revokedAt);
  const revokedKeys = apiKeys.filter((k) => k.revokedAt);
  const baseUrl = typeof window !== "undefined" ? `${window.location.origin}/api/v1/public` : "/api/v1/public";

  async function handleGenerate() {
    const label = newLabel.trim() || "New key";
    setGenerating(true);
    const result = await generateApiKey(label);
    setGenerating(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setNewLabel("");
    setRevealed({ apiKey: result.apiKey, secret: result.secret });
  }

  async function handleCopySecret() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
      toast.success("Key copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select and copy the key manually.");
    }
  }

  if (!isOwner) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Link href="/settings" className="text-caption font-medium text-muted-foreground">
            <Icon name="arrowLeft" size={16} />
          </Link>
          <h1 className="text-screen-title font-semibold text-ink">API Keys</h1>
        </div>
        <EmptyState icon="key" title="Owner only" description="Only the household owner can generate or revoke API keys." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-caption font-medium text-muted-foreground">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">API Keys</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Scoped, revocable keys for automations like Home Assistant or Apple Shortcuts.</p>
        </div>
      </div>

      {revealed ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-yellow bg-yellow/5 p-5 shadow-sm">
          <div className="flex items-start gap-2">
            <Icon name="key" size={18} className="mt-0.5 shrink-0 text-yellow" />
            <div>
              <p className="text-body font-semibold text-ink">{revealed.apiKey.label} — copy this now</p>
              <p className="text-caption text-muted-foreground">This is the only time the full key is shown. It isn&apos;t stored anywhere, including here — if you lose it, revoke it and generate a new one.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2.5">
            <p className="min-w-0 flex-1 truncate font-mono text-caption text-ink">{revealed.secret}</p>
            <Button size="icon-sm" variant="outline" onClick={handleCopySecret} aria-label="Copy key">
              <Icon name={copied ? "check" : "copy"} size={14} />
            </Button>
          </div>
          <Button variant="outline" onClick={() => setRevealed(null)}>
            I&apos;ve saved it
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="What's this for? e.g. Home Assistant" className="h-10 flex-1" />
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="key" size={16} />}
            Generate
          </Button>
        </div>
      )}

      {activeKeys.length === 0 && !revealed ? (
        <EmptyState icon="key" title="No API keys yet" description="Generate one to connect Shohaz to Home Assistant or Shortcuts." />
      ) : (
        activeKeys.length > 0 && (
          <div className="rounded-xl bg-white shadow-sm">
            {activeKeys.map((k, i) => (
              <div key={k.id} className={cn("flex items-center gap-3 px-4 py-3", i === activeKeys.length - 1 ? "" : "border-b border-border")}>
                <Icon name="key" size={18} className="text-ink" />
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{k.label}</p>
                  <p className="font-mono text-caption text-muted-foreground">
                    {k.keyPrefix}…{k.lastFour} · created {formatDate(k.createdAt)} · {k.lastUsedAt ? `last used ${formatDate(k.lastUsedAt)}` : "never used"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setRevoking(k)}>
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )
      )}

      {revokedKeys.length > 0 && (
        <div className="rounded-xl bg-surface-muted shadow-sm">
          {revokedKeys.map((k, i) => (
            <div key={k.id} className={cn("flex items-center gap-3 px-4 py-3 opacity-60", i === revokedKeys.length - 1 ? "" : "border-b border-border")}>
              <Icon name="key" size={18} className="text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink">{k.label}</p>
                <p className="font-mono text-caption text-muted-foreground">
                  {k.keyPrefix}…{k.lastFour} · revoked {formatDate(k.revokedAt as string)}
                </p>
              </div>
              <span className="rounded-full bg-border px-2 py-0.5 text-micro font-medium text-muted-foreground">Revoked</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-5 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Using a key</p>
        <div>
          <p className="text-caption text-muted-foreground">Base URL</p>
          <p className="mt-0.5 break-all font-mono text-caption text-ink">{baseUrl}</p>
        </div>
        <div>
          <p className="text-caption text-muted-foreground">Every request needs</p>
          <p className="mt-0.5 font-mono text-caption text-ink">Authorization: Bearer &lt;your key&gt;</p>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          {ENDPOINTS.map((e) => (
            <div key={`${e.method} ${e.path}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-micro">
              <span className={cn("w-14 shrink-0 font-semibold", e.method === "GET" && "text-brand-700", e.method === "POST" && "text-badge-green-text", e.method === "PATCH" && "text-yellow", e.method === "DELETE" && "text-danger")}>
                {e.method}
              </span>
              <span className="text-ink">{e.path}</span>
              <span className="w-full text-micro text-muted-foreground sm:w-auto">— {e.note}</span>
            </div>
          ))}
        </div>
        <p className="text-micro text-muted-foreground">
          Household context comes entirely from the key — no householdId needed in the request body. All three resources return/accept the same shape as the app&apos;s own screens (camelCase JSON).
        </p>
      </div>

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        tone="danger"
        icon="danger"
        title="Revoke this key?"
        description="Anything using this key (Home Assistant, Shortcuts) will immediately lose access. This can't be undone — you'd need to generate a new key."
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revoking) {
            revokeApiKey(revoking.id);
            toast.success("Key revoked");
          }
        }}
      />
    </div>
  );
}
