import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
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
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

interface OpenMeteoResponse {
  current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
  daily?: {
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
  };
}

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

  const url =
    `${OPEN_METEO_FORECAST_URL}?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&temperature_unit=fahrenheit&timezone=auto&forecast_days=1";

  // Bounded the same way /api/v1/barcode/lookup's own upstream call is —
  // this blocks the Overview page's widget render, and a hanging upstream
  // response shouldn't leave that stuck indefinitely.
  let upstream: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      upstream = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ error: "Couldn't reach the weather service. Check your connection and try again.", retryable: true }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Weather is temporarily unavailable.", retryable: true }, { status: 502 });
  }

  let payload: OpenMeteoResponse;
  try {
    payload = (await upstream.json()) as OpenMeteoResponse;
  } catch {
    return NextResponse.json({ error: "Weather is temporarily unavailable.", retryable: true }, { status: 502 });
  }

  const temperatureF = payload.current?.temperature_2m;
  const weatherCode = payload.current?.weather_code;
  const todayHighF = payload.daily?.temperature_2m_max?.[0];
  const todayLowF = payload.daily?.temperature_2m_min?.[0];
  if (temperatureF === undefined || weatherCode === undefined || todayHighF === undefined || todayLowF === undefined) {
    return NextResponse.json({ error: "Weather is temporarily unavailable.", retryable: true }, { status: 502 });
  }

  return NextResponse.json<WeatherSnapshot>({
    temperatureF: Math.round(temperatureF),
    weatherCode,
    isDay: payload.current?.is_day !== 0,
    todayHighF: Math.round(todayHighF),
    todayLowF: Math.round(todayLowF),
    precipitationChancePercent: payload.daily?.precipitation_probability_max?.[0] ?? 0,
  });
}
