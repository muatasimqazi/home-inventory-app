import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWeatherSnapshot } from "@/lib/weather-server";
import type { WeatherSnapshot } from "@/lib/weather";

export const runtime = "nodejs";

// Weather lookup for the Overview page's weather widget (docs note: a
// foundation for later weather-aware suggestions, e.g. "it's going to
// rain today, wear your jacket"). Server-side so the browser never talks
// to the upstream service directly, same "proxy it" shape as
// /api/v1/barcode/lookup.
//
// Provider: Open-Meteo's free public Forecast API
// (https://open-meteo.com/en/docs). No marketplace product exists for
// weather data (`vercel integration categories` has no matching
// category — checked, same as barcode/lookup's own precedent) and
// Open-Meteo requires NO API key or account signup, so this follows the
// same "direct external API, no marketplace integration exists, no
// credential setup required" path already established in this codebase
// for UPCitemdb (/api/v1/barcode/lookup) and RESEND_API_KEY.
//
// The actual fetch lives in lib/weather-server.ts, shared with
// send-weather-alerts' cron job (which has no user session to pass this
// route's own auth check below).
export async function GET(request: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const lat = Number(searchParams.get("lat"));
  const lon = Number(searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return NextResponse.json({ error: "`lat` and `lon` must be valid coordinates." }, { status: 400 });
  }

  const snapshot = await fetchWeatherSnapshot(lat, lon);
  if (!snapshot) {
    return NextResponse.json({ error: "Weather is temporarily unavailable.", retryable: true }, { status: 502 });
  }

  return NextResponse.json<WeatherSnapshot>(snapshot);
}
