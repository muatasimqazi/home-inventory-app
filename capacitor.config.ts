import type { CapacitorConfig } from "@capacitor/cli";

// The native shells (docs/Mobile App Addendum.md) load the real, live
// production deployment via server.url rather than a bundled static
// export — Schuaz is a fully dynamic Next.js app (SSR cookie auth, ~30
// API routes, Vercel Cron), so a static export would mean rearchitecting
// the whole app first. webDir/www is a placeholder only (see its own
// index.html comment) — `npx cap sync` requires one to exist, but it's
// never what actually loads once server.url is set.
//
// androidScheme "https" (not the Capacitor default "http") matches the
// real deployment's own scheme — needed for Supabase's cookie-based
// session (`@supabase/ssr`) to behave the same secure way it does in a
// real mobile browser, and for the WebView's own cookie jar to treat this
// as a normal HTTPS origin.
const config: CapacitorConfig = {
  appId: "com.muatasim.schuaz",
  appName: "Schuaz",
  webDir: "www",
  server: {
    url: "https://schuaz.com",
    androidScheme: "https",
  },
};

export default config;
