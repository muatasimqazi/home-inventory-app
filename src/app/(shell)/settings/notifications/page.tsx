"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { Button } from "@/components/ui/button";
import { usePushNotifications } from "@/hooks/use-push-notifications";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToNotificationPreference } from "@/lib/supabase/mappers";
import type { NotificationPreferenceRow } from "@/lib/supabase/mappers";

/** Event types wired to a real send job (Household Hub Addendum §5's generalized push infrastructure) — bill.due (Finance's recurring bills), debt_payment.due_today (the same recurring bills, but only credit card/loan/mortgage ones, and only exactly on the due date — see send-debt-payments-due-today/route.ts for why this needs its own event key rather than reusing bill.due's), capture.nudge (Household Ledger PRD §26 — the finance-triggered inventory capture nudge, src/app/api/v1/push/send-capture-nudges/), item.low_stock (0032_low_stock_alerts.sql, src/app/api/v1/push/send-low-stock-alerts/), and household.activity (real-time, src/app/api/v1/webhooks/activity-log/ — a database trigger on activity_log, not a cron poll like the others). More rows get added here as future domains plug into the same pipeline. */
const EVENT_TYPES: { domainKey: string; eventType: string; label: string; description: string }[] = [
  { domainKey: "finance", eventType: "bill.due", label: "Bill reminders", description: "A recurring bill is due within a few days" },
  {
    domainKey: "finance",
    eventType: "debt_payment.due_today",
    label: "Credit card & loan payments due today",
    description: "A credit card, loan, or mortgage payment is due today — separate from the few-days-ahead bill reminder above",
  },
  {
    domainKey: "inventory",
    eventType: "capture.nudge",
    label: "Capture reminders",
    description: "A big purchase posts and we don't have a photo of it yet",
  },
  {
    domainKey: "inventory",
    eventType: "item.low_stock",
    label: "Low-stock alerts",
    description: "An item with a minimum quantity set drops to or below it",
  },
  {
    domainKey: "tasks",
    eventType: "task.due",
    label: "Task reminders",
    description: "A household task, chore, or appointment is due or overdue",
  },
  {
    domainKey: "activity",
    eventType: "household.activity",
    label: "Household activity",
    description: "Every change anyone makes in Schuaz — including your own",
  },
];

export default function NotificationSettingsPage() {
  const { state, subscribe, unsubscribe } = usePushNotifications();
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const [busy, setBusy] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseBrowserClient().from("notification_preferences").select("*").eq("user_id", currentUserId);
      if (cancelled) return;
      const rows = ((data ?? []) as NotificationPreferenceRow[]).map(rowToNotificationPreference);
      const next: Record<string, boolean> = {};
      for (const { domainKey, eventType } of EVENT_TYPES) {
        const existing = rows.find((r) => r.domainKey === domainKey && r.eventType === eventType);
        // No row = default enabled (opt-out model — see EVENT_TYPES comment
        // and the send job's own matching default).
        next[`${domainKey}.${eventType}`] = existing ? existing.enabled : true;
      }
      setPrefs(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId]);

  async function togglePref(domainKey: string, eventType: string, enabled: boolean) {
    const key = `${domainKey}.${eventType}`;
    setPrefs((p) => ({ ...p, [key]: enabled }));
    const { error } = await getSupabaseBrowserClient()
      .from("notification_preferences")
      .upsert(
        { user_id: currentUserId, household_id: useInventoryStore.getState().currentHouseholdId, domain_key: domainKey, event_type: eventType, channel: "push", enabled, updated_at: new Date().toISOString() },
        { onConflict: "user_id,domain_key,event_type" }
      );
    if (error) {
      setPrefs((p) => ({ ...p, [key]: !enabled }));
      toast.error("Couldn't save that preference.");
    }
  }

  async function handleEnable() {
    setBusy(true);
    const result = await subscribe();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't enable notifications.");
      return;
    }
    toast.success("Notifications enabled on this device");
  }

  async function handleDisable() {
    setBusy(true);
    const result = await unsubscribe();
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't disable notifications.");
      return;
    }
    toast("Notifications turned off on this device");
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Notifications</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">Get reminders on this device.</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
            <Icon name="bell" size={18} className="text-yellow" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body font-medium text-ink">This device</p>
            <p className="text-caption text-muted-foreground">
              {state === "checking" && "Checking…"}
              {state === "unsupported" && "Notifications aren't supported in this browser."}
              {state === "denied" && "Blocked — enable notifications for Schuaz in your browser or OS settings, then try again."}
              {state === "subscribed" && "Notifications are on for this device."}
              {state === "not-subscribed" && "Off. Turn on to get reminders (like bills due soon) even when Schuaz isn't open."}
            </p>
          </div>
        </div>

        {state === "not-subscribed" && (
          <Button size="lg" className="bg-ink-fill text-white hover:bg-ink-fill/90" onClick={handleEnable} disabled={busy}>
            {busy ? <Icon name="spinner" size={16} className="animate-spin" /> : "Enable reminders"}
          </Button>
        )}
        {state === "subscribed" && (
          <Button variant="outline" size="lg" onClick={handleDisable} disabled={busy}>
            {busy ? <Icon name="spinner" size={16} className="animate-spin" /> : "Turn off on this device"}
          </Button>
        )}
      </div>

      {state === "subscribed" && (
        <div>
          <p className="mb-2 text-caption font-medium tracking-wide text-muted-foreground uppercase">What to notify me about</p>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
            {EVENT_TYPES.map(({ domainKey, eventType, label, description }) => {
              const key = `${domainKey}.${eventType}`;
              const enabled = prefs[key] ?? true;
              return (
                <label key={key} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-body font-medium text-ink">{label}</p>
                    <p className="text-caption text-muted-foreground">{description}</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => togglePref(domainKey, eventType, e.target.checked)}
                    className="size-5 shrink-0"
                  />
                </label>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-center text-micro text-muted-foreground">
        Push only reaches devices that have Schuaz installed (added to your home screen) and notifications enabled — everything above is
        always visible in-app too.
      </p>
    </div>
  );
}
