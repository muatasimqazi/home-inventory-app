"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Icon } from "@/components/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInventoryStore } from "@/lib/store";
import type { GeocodeResult } from "@/app/api/v1/weather/geocode/route";

/**
 * Sets the household's home location (0054_household_location.sql) — the
 * Overview weather widget's only real input. Two ways in, same as most
 * "where is this" pickers in this app already offer a shortcut plus a
 * manual fallback (e.g. move-sheet.tsx's search alongside browse):
 * "Use my location" (browser geolocation, one tap, no typing) or a city
 * search (works when geolocation is denied/unavailable, or the household
 * wants a different location than the device currently reports — a
 * vacation home, say). Owner-only in effect (setHouseholdLocation's own
 * RLS), but not gated in this component itself — the button just won't
 * persist for a non-owner, same posture renameHousehold's call site takes.
 */
export function SetHouseholdLocationSheet({ open, onOpenChange, householdId }: { open: boolean; onOpenChange: (open: boolean) => void; householdId: string }) {
  const setHouseholdLocation = useInventoryStore((s) => s.setHouseholdLocation);

  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [savingLabel, setSavingLabel] = useState<string | null>(null);

  async function save(latitude: number, longitude: number, locationLabel: string) {
    setSavingLabel(locationLabel);
    const result = await setHouseholdLocation(householdId, { latitude, longitude, locationLabel });
    setSavingLabel(null);
    if (!result.ok) {
      toast.error(result.error ?? "Couldn't save location.");
      return;
    }
    toast.success(`Location set to ${locationLabel}`);
    onOpenChange(false);
  }

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser doesn't support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        // No free reverse-geocode in this same provider (Open-Meteo's
        // Geocoding API is name -> coordinates only, not the reverse) —
        // a generic label here, same as the city-search path below still
        // gives a real place name for anyone who wants one.
        save(position.coords.latitude, position.coords.longitude, "Current location");
      },
      () => {
        setLocating(false);
        toast.error("Couldn't get your location — try searching for your city instead.");
      },
      { timeout: 10_000, enableHighAccuracy: false }
    );
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setResults(null);
    try {
      const res = await fetch(`/api/v1/weather/geocode?query=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Search failed.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setQuery("");
          setResults(null);
        }
        onOpenChange(next);
      }}
    >
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-section-title font-medium text-ink">Set your home location</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <p className="text-caption text-muted-foreground">Used for the Overview page&apos;s weather — shared by the whole household, same as Locations or the Home Map.</p>

          <Button size="lg" className="w-full" onClick={handleUseMyLocation} disabled={locating || savingLabel !== null}>
            {locating || savingLabel === "Current location" ? <Icon name="spinner" size={16} className="animate-spin" /> : <Icon name="pin" size={16} />}
            Use my location
          </Button>

          <div className="flex items-center gap-2 text-caption text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or search for a city
            <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Austin, TX" className="h-11 flex-1" />
            <Button type="submit" variant="secondary" disabled={searching || query.trim().length < 2}>
              {searching ? <Icon name="spinner" size={14} className="animate-spin" /> : <Icon name="search" size={16} />}
            </Button>
          </form>

          {results !== null && (
            <div className="flex flex-col gap-1">
              {results.length === 0 ? (
                <p className="px-1 text-caption text-muted-foreground">No matches — try a different spelling.</p>
              ) : (
                results.map((r) => (
                  <button
                    key={`${r.latitude},${r.longitude}`}
                    type="button"
                    onClick={() => save(r.latitude, r.longitude, r.label)}
                    disabled={savingLabel !== null}
                    className="tap-target flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-body text-ink hover:bg-surface-muted disabled:opacity-60"
                  >
                    <Icon name="pin" size={14} className="shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    {savingLabel === r.label && <Icon name="spinner" size={14} className="shrink-0 animate-spin" />}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
