import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// City-name -> coordinates search, for a household that declines/can't use
// browser geolocation (see set-household-location-sheet.tsx) or wants to
// set a different home location than the device currently reports. Same
// provider family as /api/v1/weather (Open-Meteo's free Geocoding API,
// https://open-meteo.com/en/docs/geocoding-api) — no API key, no
// marketplace product exists for this.
const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

interface OpenMeteoGeocodingResult {
  name: string;
  latitude: number;
  longitude: number;
  admin1?: string;
  country?: string;
}

export interface GeocodeResult {
  label: string;
  latitude: number;
  longitude: number;
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
  const query = searchParams.get("query")?.trim() ?? "";
  if (query.length < 2) {
    return NextResponse.json<{ results: GeocodeResult[] }>({ results: [] });
  }

  let upstream: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      upstream = await fetch(`${OPEN_METEO_GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=en`, {
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return NextResponse.json({ error: "Couldn't reach the location search service. Check your connection and try again.", retryable: true }, { status: 502 });
  }

  if (!upstream.ok) {
    return NextResponse.json({ error: "Location search is temporarily unavailable.", retryable: true }, { status: 502 });
  }

  let payload: { results?: OpenMeteoGeocodingResult[] };
  try {
    payload = (await upstream.json()) as { results?: OpenMeteoGeocodingResult[] };
  } catch {
    payload = {};
  }

  const results: GeocodeResult[] = (payload.results ?? []).map((r) => ({
    label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
    latitude: r.latitude,
    longitude: r.longitude,
  }));

  return NextResponse.json<{ results: GeocodeResult[] }>({ results });
}
