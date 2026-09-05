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
 * Plain-language outfit/prep suggestions computed from a snapshot's real
 * numbers — for the Ask AI's getTodaysWeather tool ("what should I wear
 * today"), so it has ready-made, consistent thresholds to hand back
 * instead of the model inventing its own cutoffs each time. Deliberately
 * separate from weatherAlertCopy below (which has its own, narrower
 * "notable" thresholds tuned for a once-a-day push) rather than shared —
 * a conversational answer wants a always-applicable recommendation
 * (something to wear, even on an unremarkable day), where the push only
 * speaks up when there's something worth interrupting for.
 */
export function weatherOutfitHints(snapshot: WeatherSnapshot): string[] {
  const hints: string[] = [];
  if (snapshot.precipitationChancePercent >= 40) {
    hints.push(`${snapshot.precipitationChancePercent}% chance of rain/snow — bring an umbrella or rain jacket`);
  }
  if (snapshot.todayLowF <= 32) {
    hints.push("below freezing — a heavy coat, hat, and gloves");
  } else if (snapshot.todayLowF <= 50) {
    hints.push("chilly, especially in the morning — a jacket or sweater");
  } else if (snapshot.todayHighF >= 95) {
    hints.push("hot — light, breathable clothing, and stay hydrated");
  } else if (snapshot.todayHighF >= 85) {
    hints.push("warm — light clothing");
  }
  return hints;
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
