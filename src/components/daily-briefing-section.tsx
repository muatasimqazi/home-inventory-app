"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useCurrentHousehold, useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToDailyBriefingPreference } from "@/lib/supabase/mappers";
import type { DailyBriefingPreferenceRow } from "@/lib/supabase/mappers";
import type { DailyBriefingPreference } from "@/lib/types";
import { weatherCondition, weatherOutfitHints, type WeatherSnapshot } from "@/lib/weather";
import { isDueToday } from "@/lib/selectors";
import { formatCurrency } from "@/lib/format";

// Same localStorage-with-try/catch shape store.ts's own last-household
// persistence and desktop-sidebar.tsx's collapsed-state persistence
// already use — private-browsing/storage-disabled contexts can throw on
// write, the tile just won't remember being dismissed there. Not
// user-scoped in the key: same "per device, not per account" tradeoff
// those two already make, and this app is effectively single-user per
// device in practice.
const DISMISSED_STORAGE_KEY = "schuaz:daily-briefing-promo-dismissed";

function readDismissed(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(DISMISSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function storeDismissed(): void {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(DISMISSED_STORAGE_KEY, "1");
  } catch {
    // ignore — see readDismissed's own comment
  }
}

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}

/**
 * Dashboard surface for the Daily briefing feature (settings/
 * notifications/daily-briefing/) — two very different things depending
 * on whether the signed-in user has actually opted in:
 *
 * - Not enabled: a dismissable one-time nudge toward turning it on
 *   (persisted locally, not asked again once closed) — opt-in and off
 *   by default, so unlike every other push event nobody discovers it
 *   just by having notifications on.
 * - Enabled: the actual "Today's briefing" content — greeting, weather
 *   + outfit hint, tasks/bills due today, built from the same pieces
 *   send-daily-briefing/route.ts uses for the push, respecting the same
 *   include_* toggles. This exists because the push-only version had no
 *   in-app fallback at all, unlike every other event type in this app
 *   (see settings/notifications/page.tsx's own "everything above is
 *   always visible in-app too" line) — visible here regardless of
 *   whether today's push has fired yet, not gated on the chosen hour,
 *   since checking the dashboard shouldn't depend on catching the right
 *   moment.
 *
 * Tasks/bills come straight from the store, already RLS-scoped to what
 * this user can see — no hand-rolled visibility filtering needed here,
 * unlike the admin-client cron route. isDueToday (selectors.ts) does the
 * same calendar-day comparison that route does with the household's own
 * timezone, just using the browser's local zone instead (the same one
 * in practice for a household's own members).
 */
export function DailyBriefingSection() {
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const household = useCurrentHousehold();
  const tasks = useInventoryStore((s) => s.tasks);
  const recurringBills = useInventoryStore((s) => s.recurringBills);
  const [dismissed, setDismissed] = useState(true); // starts hidden — avoids a flash before the localStorage check below resolves
  const [pref, setPref] = useState<DailyBriefingPreference | null | undefined>(undefined); // undefined = still loading
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    // Deferred a tick (react-hooks/set-state-in-effect) — same pattern
    // desktop-sidebar.tsx's own collapsed-state reconciliation uses.
    queueMicrotask(() => {
      setDismissed(readDismissed());
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSupabaseBrowserClient()
        .from("daily_briefing_preferences")
        .select("*")
        .eq("user_id", currentUserId)
        .eq("household_id", household.id)
        .maybeSingle();
      if (cancelled) return;
      setPref(data ? rowToDailyBriefingPreference(data as DailyBriefingPreferenceRow) : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, household.id]);

  const enabled = pref?.enabled ?? false;
  const needsWeather = enabled && (pref?.includeWeather || pref?.includeOutfit);

  useEffect(() => {
    if (!needsWeather || household.latitude === null || household.longitude === null) return;
    let cancelled = false;
    fetch(`/api/v1/weather?lat=${household.latitude}&lon=${household.longitude}`)
      .then(async (res) => (res.ok ? ((await res.json()) as WeatherSnapshot) : null))
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [needsWeather, household.latitude, household.longitude]);

  if (pref === undefined) return null; // still loading — avoid a flash of the wrong branch

  if (!enabled) {
    if (dismissed) return null;
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
          <Icon name="sun" size={18} className="text-yellow" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">Get a daily briefing</p>
          <p className="text-caption text-muted-foreground">A greeting with weather, what to wear, and what&apos;s due — opt in and pick your own time.</p>
        </div>
        <Link href="/settings/notifications/daily-briefing" className="shrink-0 text-caption font-medium text-yellow">
          Set up
        </Link>
        <button
          type="button"
          onClick={() => {
            storeDismissed();
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="tap-target flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-muted"
        >
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  }

  if (!pref) return null; // unreachable (enabled implies pref is set) — narrows the type below

  const condition = weather ? weatherCondition(weather.weatherCode) : null;
  const outfitHint = pref.includeOutfit && weather ? (weatherOutfitHints(weather)[0] ?? null) : null;
  const tasksDueToday = pref.includeTasks ? tasks.filter((t) => t.isActive && !t.trashedAt && isDueToday(t.dueAt)) : [];
  const billsDueToday = pref.includeBills ? recurringBills.filter((b) => b.isActive && !b.trashedAt && isDueToday(b.nextDueDate)) : [];

  const parts: string[] = [];
  if (outfitHint) parts.push(outfitHint.charAt(0).toUpperCase() + outfitHint.slice(1));
  if (tasksDueToday.length === 1) parts.push(`1 task due today: ${tasksDueToday[0].title}`);
  else if (tasksDueToday.length > 1) parts.push(`${tasksDueToday.length} tasks due today`);
  if (billsDueToday.length === 1) parts.push(`${billsDueToday[0].name} (${formatCurrency(billsDueToday[0].expectedAmount)}) due today`);
  else if (billsDueToday.length > 1) parts.push(`${billsDueToday.length} bills due today`);
  if (parts.length === 0) parts.push("Nothing on your plate today — enjoy it.");

  return (
    <Link href="/settings/notifications/daily-briefing" className="block rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100">
          <Icon name="sun" size={18} className="text-yellow" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-ink">
            {greetingForHour(new Date().getHours())}
            {pref.includeWeather && condition && weather ? ` ${condition.emoji} H${weather.todayHighF}° L${weather.todayLowF}°` : ""}
          </p>
          <p className="mt-0.5 text-caption text-muted-foreground">{parts.join(" · ")}</p>
        </div>
      </div>
    </Link>
  );
}
