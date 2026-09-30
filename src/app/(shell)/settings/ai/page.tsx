"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { Switch } from "@/components/ui/switch";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { setAiConsent } from "@/lib/ai-consent-store";
import { AI_DATA_SENT, AI_RECIPIENTS, hasAiConsent } from "@/lib/ai-consent";

/**
 * Where a user reviews, grants, or withdraws the AI data-sharing consent
 * the in-app dialog asks for (lib/ai-consent.ts). Withdrawing takes effect
 * on the next request — every AI route checks it server-side.
 */
export default function AiSettingsPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => setEnabled(hasAiConsent(data.session?.user)));
  }, []);

  async function handleChange(next: boolean) {
    setSaving(true);
    try {
      await setAiConsent(next);
      setEnabled(next);
      toast.success(next ? "AI features turned on" : "AI features turned off");
    } catch {
      toast.error("Couldn't save that. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/settings" className="text-caption font-medium text-muted-foreground">
          <Icon name="arrowLeft" size={16} />
        </Link>
        <div>
          <h1 className="text-screen-title font-semibold text-ink">AI Features</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Control whether Schuaz can send your data to AI services.</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <p className="text-item-title font-medium text-ink">Allow AI features</p>
          <p className="mt-1 text-caption text-muted-foreground">
            {enabled === null ? "Loading…" : enabled ? "On. AI features can send the data below when you use them." : "Off. Nothing is sent to AI services."}
          </p>
        </div>
        <Switch checked={enabled ?? false} onCheckedChange={handleChange} disabled={enabled === null || saving} aria-label="Allow AI features" />
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">What&apos;s sent, only when you use an AI feature</p>
        <ul className="list-disc space-y-1.5 pl-5 text-caption text-muted-foreground">
          {AI_DATA_SENT.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <p className="text-caption font-medium tracking-wide text-muted-foreground uppercase">Who receives it</p>
        <ul className="space-y-1.5 text-caption text-muted-foreground">
          {AI_RECIPIENTS.map((r) => (
            <li key={r.name}>
              <span className="font-medium text-ink">{r.name}:</span> {r.role}
            </li>
          ))}
        </ul>
      </div>

      <p className="px-1 text-caption text-muted-foreground">
        With AI features off, everything else in Schuaz keeps working: you can still add items, receipts, and transactions by hand. See the{" "}
        <Link href="/privacy" className="font-medium text-yellow-text">
          Privacy Policy
        </Link>{" "}
        for details.
      </p>
    </div>
  );
}
