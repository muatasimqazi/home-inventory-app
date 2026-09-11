"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Icon } from "@/components/icon";
import { BackButton } from "@/components/back-button";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToDailyBriefingPreference } from "@/lib/supabase/mappers";
import type { DailyBriefingPreferenceRow } from "@/lib/supabase/mappers";
import type { DailyBriefingPreference } from "@/lib/types";

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const period = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:00 ${period}`;
});

const DEFAULT_PREF: Omit<DailyBriefingPreference, "id" | "householdId" | "userId" | "updatedAt"> = {
  enabled: false,
  notificationHour: 7,
  includeWeather: true,
  includeOutfit: true,
  includeTasks: true,
  includeBills: true,
};

const CONTENT_TOGGLES: { key: "includeWeather" | "includeOutfit" | "includeTasks" | "includeBills"; label: string; description: string }[] = [
  { key: "includeWeather", label: "Weather", description: "Today's forecast for your household's location" },
  { key: "includeOutfit", label: "What to wear", description: "A quick outfit hint based on the forecast" },
  { key: "includeTasks", label: "Tasks due today", description: "Anything on your task list due today" },
  { key: "includeBills", label: "Bills due today", description: "Any bill due today, visible to you" },
];

/**
 * Customization for the "Morning briefing" push (household.daily_briefing,
 * send-daily-briefing/route.ts) — unlike this app's other push events,
 * which are opt-out toggles on the parent notifications page, this one is
 * opt-in with its own send hour and which sections to include, so it
 * needs a real sub-page rather than a single checkbox row. Backed by its
 * own table (daily_briefing_preferences, 0059) rather than
 * notification_preferences, which has no room for a custom hour or
 * per-section toggles — see that migration's own comment.
 */
export default function DailyBriefingSettingsPage() {
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const [pref, setPref] = useState<DailyBriefingPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("daily_briefing_preferences")
        .select("*")
        .eq("user_id", currentUserId)
        .eq("household_id", currentHouseholdId)
        .maybeSingle();
      if (cancelled) return;
      setPref(data ? rowToDailyBriefingPreference(data as DailyBriefingPreferenceRow) : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentHouseholdId]);

  async function save(next: Omit<DailyBriefingPreference, "id" | "householdId" | "userId" | "updatedAt">) {
    setSaving(true);
    const previous = pref;
    setPref((p) => ({ ...(p ?? { id: "", householdId: currentHouseholdId, userId: currentUserId, updatedAt: new Date().toISOString() }), ...next }));

    const { data, error } = await getSupabaseBrowserClient()
      .from("daily_briefing_preferences")
      .upsert(
        {
          user_id: currentUserId,
          household_id: currentHouseholdId,
          enabled: next.enabled,
          notification_hour: next.notificationHour,
          include_weather: next.includeWeather,
          include_outfit: next.includeOutfit,
          include_tasks: next.includeTasks,
          include_bills: next.includeBills,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,household_id" }
      )
      .select()
      .single();
    setSaving(false);

    if (error || !data) {
      setPref(previous);
      toast.error("Couldn't save that preference.");
      return;
    }
    setPref(rowToDailyBriefingPreference(data as DailyBriefingPreferenceRow));
  }

  const current = pref ?? { ...DEFAULT_PREF, id: "", householdId: currentHouseholdId, userId: currentUserId, updatedAt: "" };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <BackButton />
        <div>
          <h1 className="text-screen-title font-semibold text-ink">Morning briefing</h1>
          <p className="mt-0.5 text-caption text-muted-foreground">A greeting with what&apos;s ahead of you today.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <Icon name="spinner" size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <label className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-ink">Send me a morning briefing</p>
                <p className="text-caption text-muted-foreground">Off by default — turn on to get a daily push at your chosen time.</p>
              </div>
              <input
                type="checkbox"
                checked={current.enabled}
                disabled={saving}
                onChange={(e) => save({ ...current, enabled: e.target.checked })}
                className="size-5 shrink-0"
              />
            </label>
          </div>

          {current.enabled && (
            <>
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <p className="mb-2 text-body font-medium text-ink">Send time</p>
                <p className="mb-3 text-caption text-muted-foreground">Your household&apos;s own local time.</p>
                <select
                  value={current.notificationHour}
                  disabled={saving}
                  onChange={(e) => save({ ...current, notificationHour: Number(e.target.value) })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-body text-ink"
                >
                  {HOUR_LABELS.map((label, hour) => (
                    <option key={hour} value={hour}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-caption font-medium tracking-wide text-muted-foreground uppercase">What to include</p>
                <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
                  {CONTENT_TOGGLES.map(({ key, label, description }) => (
                    <label key={key} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-body font-medium text-ink">{label}</p>
                        <p className="text-caption text-muted-foreground">{description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={current[key]}
                        disabled={saving}
                        onChange={(e) => save({ ...current, [key]: e.target.checked })}
                        className="size-5 shrink-0"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
