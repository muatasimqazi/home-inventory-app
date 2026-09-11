"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { useInventoryStore } from "@/lib/store";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { rowToDailyBriefingPreference } from "@/lib/supabase/mappers";
import type { DailyBriefingPreferenceRow } from "@/lib/supabase/mappers";

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

/**
 * A one-time nudge toward the Daily briefing feature (settings/
 * notifications/daily-briefing/) — opt-in and off by default, so unlike
 * every other push event nobody discovers it just by having
 * notifications on. Sits right above Needs attention, dismissable
 * (persisted locally, not asked again once closed) and self-hiding once
 * the user actually turns the feature on (checked against
 * daily_briefing_preferences directly, not local state, so it also
 * disappears for someone who enabled it from Settings without ever
 * dismissing this tile).
 */
export function DailyBriefingPromoTile() {
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const [dismissed, setDismissed] = useState(true); // starts hidden — avoids a flash before the localStorage/enabled checks below resolve
  const [alreadyEnabled, setAlreadyEnabled] = useState(true);

  useEffect(() => {
    // Deferred a tick (react-hooks/set-state-in-effect) — same pattern
    // desktop-sidebar.tsx's own collapsed-state reconciliation uses: the
    // read-and-possibly-setDismissed shouldn't run synchronously inside
    // the effect body itself, only as a reaction once it's scheduled.
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
        .eq("household_id", currentHouseholdId)
        .maybeSingle();
      if (cancelled) return;
      const pref = data ? rowToDailyBriefingPreference(data as DailyBriefingPreferenceRow) : null;
      setAlreadyEnabled(pref?.enabled ?? false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, currentHouseholdId]);

  if (dismissed || alreadyEnabled) return null;

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
