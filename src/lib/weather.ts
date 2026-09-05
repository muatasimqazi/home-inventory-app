/**
 * WMO weather-interpretation codes (the same table Open-Meteo's API
 * returns — https://open-meteo.com/en/docs) mapped to a short label and
 * an emoji, for the Overview weather widget. Shared between the client
 * widget and anywhere else that ever needs to render a code (no server
 * dependency here — it's just a lookup table, safe to import from either
 * side).
 */
const WEATHER_CONDITIONS: Record<number, { label: string; emoji: string }> = {
  0: { label: "Clear sky", emoji: "☀️" },
  1: { label: "Mainly clear", emoji: "🌤️" },
  2: { label: "Partly cloudy", emoji: "⛅" },
  3: { label: "Overcast", emoji: "☁️" },
  45: { label: "Fog", emoji: "🌫️" },
  48: { label: "Fog", emoji: "🌫️" },
  51: { label: "Light drizzle", emoji: "🌦️" },
  53: { label: "Drizzle", emoji: "🌦️" },
  55: { label: "Dense drizzle", emoji: "🌦️" },
  56: { label: "Freezing drizzle", emoji: "🌧️" },
  57: { label: "Freezing drizzle", emoji: "🌧️" },
  61: { label: "Light rain", emoji: "🌧️" },
  63: { label: "Rain", emoji: "🌧️" },
  65: { label: "Heavy rain", emoji: "🌧️" },
  66: { label: "Freezing rain", emoji: "🌧️" },
  67: { label: "Freezing rain", emoji: "🌧️" },
  71: { label: "Light snow", emoji: "🌨️" },
  73: { label: "Snow", emoji: "🌨️" },
  75: { label: "Heavy snow", emoji: "🌨️" },
  77: { label: "Snow grains", emoji: "🌨️" },
  80: { label: "Light showers", emoji: "🌦️" },
  81: { label: "Showers", emoji: "🌧️" },
  82: { label: "Violent showers", emoji: "⛈️" },
  85: { label: "Snow showers", emoji: "🌨️" },
  86: { label: "Heavy snow showers", emoji: "🌨️" },
  95: { label: "Thunderstorm", emoji: "⛈️" },
  96: { label: "Thunderstorm with hail", emoji: "⛈️" },
  99: { label: "Thunderstorm with hail", emoji: "⛈️" },
};

export function weatherCondition(code: number): { label: string; emoji: string } {
  return WEATHER_CONDITIONS[code] ?? { label: "Unknown", emoji: "🌡️" };
}

/** One household's current weather + today's outlook — the shape /api/v1/weather returns. */
export interface WeatherSnapshot {
  temperatureF: number;
  weatherCode: number;
  isDay: boolean;
  todayHighF: number;
  todayLowF: number;
  precipitationChancePercent: number;
}

/**
 * The daily weather push's copy (send-weather-alerts/route.ts) — one
 * notification a day, every day a household has a location set, same
 * "always-on, opt out if you don't want it" posture as Household activity's
 * push. Body always leads with today's outlook; a notable condition (real
 * rain/snow chance or an extreme high/low) gets an extra call-out line —
 * the seed for the "wear your jacket" suggestions the household-location
 * work was explicitly building toward, kept to plain text for now.
 */
export function weatherAlertCopy(snapshot: WeatherSnapshot, locationLabel: string | null): { title: string; body: string } {
  const condition = weatherCondition(snapshot.weatherCode);
  const title = locationLabel ? `Today's weather in ${locationLabel}` : "Today's weather";
  const lines = [`${condition.emoji} ${condition.label}, H${snapshot.todayHighF}° L${snapshot.todayLowF}°`];

  if (snapshot.precipitationChancePercent >= 40) {
    lines.push(`${snapshot.precipitationChancePercent}% chance of precipitation — bring an umbrella.`);
  }
  if (snapshot.todayLowF <= 32) {
    lines.push("Below freezing today — bundle up.");
  } else if (snapshot.todayHighF >= 95) {
    lines.push("Heat's on today — stay hydrated.");
  }

  return { title, body: lines.join(" ") };
}
