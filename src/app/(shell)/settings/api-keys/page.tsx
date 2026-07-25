"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { EmptyState } from "@/components/empty-state";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { id } from "@/lib/id";

interface ApiKey {
  id: string;
  label: string;
  lastFour: string;
  createdAt: string;
}

function randomKeyTail() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([
    { id: "key_1", label: "Home Assistant", lastFour: "8QRT", createdAt: "2026-06-01" },
  ]);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  function generate() {
    const key: ApiKey = { id: id("key"), label: "New key", lastFour: randomKeyTail(), createdAt: new Date().toISOString().slice(0, 10) };
    setKeys((k) => [...k, key]);
    toast.success("API key generated — copy it now, it won't be shown again.");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-screen-title font-medium text-ink">API Keys</h1>
      <p className="text-body text-muted-foreground">
        Scoped, revocable keys for automations like Home Assistant or Apple Shortcuts — separate from your personal sign-in.
      </p>

      <Button size="lg" onClick={generate}>
        <Icon name="key" size={16} /> Generate new key
      </Button>

      {keys.length === 0 ? (
        <EmptyState icon="key" title="No API keys yet" description="Generate one to connect Shohaz to Home Assistant or Shortcuts." />
      ) : (
        <div className="rounded-xl bg-white shadow-sm">
          {keys.map((k, i) => (
            <div key={k.id} className={`flex items-center gap-3 px-4 py-3 ${i === keys.length - 1 ? "" : "border-b border-border"}`}>
              <Icon name="key" size={18} className="text-ink" />
              <div className="min-w-0 flex-1">
                <p className="text-body text-ink">{k.label}</p>
                <p className="font-mono text-caption text-muted-foreground">shz_••••••••{k.lastFour} · created {k.createdAt}</p>
              </div>
              <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setRevoking(k)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!revoking}
        onOpenChange={(open) => !open && setRevoking(null)}
        tone="danger"
        icon="danger"
        title="Revoke this key?"
        description="Anything using this key (Home Assistant, Shortcuts) will immediately lose access."
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revoking) {
            setKeys((k) => k.filter((x) => x.id !== revoking.id));
            toast.success("Key revoked");
          }
        }}
      />
    </div>
  );
}
