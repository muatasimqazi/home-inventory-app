import "server-only";
import { find } from "geo-tz";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * IANA timezone for a household's stored lat/lon (households.latitude/
 * longitude, 0054_household_location.sql) — a real geographic boundary
 * lookup (geo-tz, offline, no network call), not a new setting to ask
 * for. Households only ever store coordinates (for the weather widget),
 * never a timezone directly, so anything that needs to reason about a
 * household's actual local time — send-daily-briefing/route.ts's "is it
 * 7am there yet" check, and its due-today task/bill boundaries — derives
 * it from here rather than assuming server-local or UTC time apply.
 */
export function timezoneForCoordinates(latitude: number, longitude: number): string | null {
  try {
    return find(latitude, longitude)[0] ?? null;
  } catch (error) {
    console.error("timezoneForCoordinates: geo-tz lookup failed:", error);
    return null;
  }
}

/** The current local hour (0-23) in the given IANA timezone. */
export function currentLocalHour(timezone: string): number {
  return toZonedTime(new Date(), timezone).getHours();
}

/**
 * [start, end) as real UTC instants spanning "today" in the given
 * timezone — for filtering a UTC-stored timestamp column (due_at,
 * next_due_date) by *local* calendar day, not the server's own UTC day,
 * which is off by a few hours to a full day for most households most of
 * the time. fromZonedTime does the actual timezone-aware conversion
 * (DST-correct) rather than hand-rolled offset math.
 */
export function todayLocalRange(timezone: string): { startIso: string; endIso: string } {
  const zonedNow = toZonedTime(new Date(), timezone);
  const year = zonedNow.getFullYear();
  const month = String(zonedNow.getMonth() + 1).padStart(2, "0");
  const day = String(zonedNow.getDate()).padStart(2, "0");
  const localMidnight = fromZonedTime(`${year}-${month}-${day}T00:00:00`, timezone);
  const nextLocalMidnight = new Date(localMidnight.getTime() + 24 * 60 * 60 * 1000);
  return { startIso: localMidnight.toISOString(), endIso: nextLocalMidnight.toISOString() };
}
