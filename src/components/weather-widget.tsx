"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { SetHouseholdLocationSheet } from "@/components/set-household-location-sheet";
import { weatherCondition, type WeatherSnapshot } from "@/lib/weather";
import type { Household } from "@/lib/types";

/**
 * Overview page's weather widget — the foundation for later weather-aware
 * suggestions (docs note: "it's going to rain today, wear your jacket").
 * Reads the household's own stored location (0054_household_location.sql,
 * set via SetHouseholdLocationSheet) rather than asking the browser for
 * live GPS on every visit — a home doesn't move between page loads, and a
 * shared household setting means every member sees the same weather
 * without each of them separately granting location permission.
 *
 * Renders inline under the Overview page's own household-name heading,
 * one line, tap-to-open-the-location-sheet whatever its current state:
 * no location yet (a plain prompt), loading, a real failure, or the
 * actual reading.
 */
export function WeatherWidget({ household }: { household: Household }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  const { latitude, longitude } = household;

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    let cancelled = false;
    // Deferred a tick (react-hooks/set-state-in-effect) — same pattern
    // used elsewhere in this app (e.g. desktop-sidebar.tsx's own
    // reconcile-on-mount effect): the setState shouldn't run
    // synchronously inside the effect body itself, only as a reaction
    // once it's scheduled. The fetch itself still starts immediately.
    queueMicrotask(() => {
      if (!cancelled) {
        setLoading(true);
        setFailed(false);
      }
    });
    fetch(`/api/v1/weather?lat=${latitude}&lon=${longitude}`)
      .then(async (res) => {
        if (!res.ok) throw new Error();
        return (await res.json()) as WeatherSnapshot;
      })
      .then((data) => {
        if (!cancelled) setWeather(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [latitude, longitude]);

  if (latitude === null || longitude === null) {
    return (
      <>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-1 flex items-center gap-1 text-caption font-medium text-yellow-text"
        >
          <Icon name="pin" size={12} /> Add your location for local weather
        </button>
        <SetHouseholdLocationSheet open={sheetOpen} onOpenChange={setSheetOpen} householdId={household.id} />
      </>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setSheetOpen(true)} className="mt-1 flex flex-wrap items-center gap-1.5 text-caption text-muted-foreground">
        {loading ? (
          <>
            <Icon name="spinner" size={12} className="animate-spin" /> Loading weather…
          </>
        ) : failed || !weather ? (
          <span className="underline underline-offset-2">Couldn&apos;t load weather</span>
        ) : (
          (() => {
            const condition = weatherCondition(weather.weatherCode);
            return (
              <>
                <span>{condition.emoji}</span>
                <span className="font-medium text-ink">{weather.temperatureF}°</span>
                <span>{condition.label}</span>
                <span>
                  · H{weather.todayHighF}° L{weather.todayLowF}°
                </span>
                {weather.precipitationChancePercent > 20 && <span>· {weather.precipitationChancePercent}% rain</span>}
                {household.locationLabel && <span>· {household.locationLabel}</span>}
              </>
            );
          })()
        )}
      </button>
      <SetHouseholdLocationSheet open={sheetOpen} onOpenChange={setSheetOpen} householdId={household.id} />
    </>
  );
}
