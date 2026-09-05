import "server-only";
import type { WeatherSnapshot } from "@/lib/weather";

// Shared Open-Meteo forecast fetch — factored out of /api/v1/weather/route.ts
// so a second caller with no user session (send-weather-alerts' cron job)
// can get the same data without going through that route's
// getSupabaseServerClient().auth.getUser() check, which only a real signed-in
// browser request can satisfy. Same provider, same "no marketplace product,
// no API key" rationale documented on that route.
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

/** Fetches one location's current + today weather. Returns null on any upstream failure or timeout — callers decide how to handle "no weather available" (an API route surfaces an error; a cron job just skips that household). */
export async function fetchWeatherSnapshot(latitude: number, longitude: number): Promise<WeatherSnapshot | null> {
  const url =
    `${OPEN_METEO_FORECAST_URL}?latitude=${latitude}&longitude=${longitude}` +
    "&current=temperature_2m,weather_code,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&temperature_unit=fahrenheit&timezone=auto&forecast_days=1";

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
    return null;
  }

  if (!upstream.ok) return null;

  let payload: OpenMeteoResponse;
  try {
    payload = (await upstream.json()) as OpenMeteoResponse;
  } catch {
    return null;
  }

  const temperatureF = payload.current?.temperature_2m;
  const weatherCode = payload.current?.weather_code;
  const todayHighF = payload.daily?.temperature_2m_max?.[0];
  const todayLowF = payload.daily?.temperature_2m_min?.[0];
  if (temperatureF === undefined || weatherCode === undefined || todayHighF === undefined || todayLowF === undefined) {
    return null;
  }

  return {
    temperatureF: Math.round(temperatureF),
    weatherCode,
    isDay: payload.current?.is_day !== 0,
    todayHighF: Math.round(todayHighF),
    todayLowF: Math.round(todayLowF),
    precipitationChancePercent: payload.daily?.precipitation_probability_max?.[0] ?? 0,
  };
}
