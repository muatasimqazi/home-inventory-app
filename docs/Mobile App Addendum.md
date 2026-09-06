# Schuaz — Mobile App Addendum (Capacitor)

Companion to the [Product Requirements Document](Product%20Requirements%20Document.md) and every domain addendum since. This document scopes wrapping Schuaz's existing Next.js web app as real iOS and Android apps via [Capacitor](https://capacitorjs.com/), rather than building separate native clients. Where this addendum is silent, the web app's existing architecture stands unchanged — that's the whole point of the approach below.

## 1. The core decision: wrap the live app, don't re-platform it

Capacitor has two fundamentally different modes, and picking wrong here is the one mistake that would waste real effort:

- **Bundled static app**: `next build && next export`'s output gets copied into the native project and shipped inside the app binary. Fast, works offline, but requires the *entire* app to be static-exportable — no server components that need a live DB read, no API routes, no cookie-based SSR auth, no cron. Schuaz is none of these things; it's a fully dynamic Next.js App Router app (Supabase SSR auth via `@supabase/ssr` cookies, ~30+ API routes, AI Gateway calls, Vercel Cron). Static export would mean rearchitecting the entire app first — a non-starter.
- **Live remote URL** (the actual recommendation): Capacitor's `server.url` config points the native WebView straight at `https://schuaz.com`, the same production deployment the browser already hits. The native "app" is a thin native shell (splash screen, status bar styling, native plugin bridge) around a WebView loading the real site. Every server component, API route, cron job, and the Supabase cookie session works completely unchanged — this is the same trick Discord's, Twitter's, and countless other hybrid apps use for exactly this reason.

**This means almost the entire existing codebase needs zero changes.** The real work is bridging the handful of things a WebView can't do as well as (or at all like) a native app: push notifications above all, plus some permission/UX polish. Everything else — every page, every API route, camera capture (`getUserMedia` already works in WKWebView/Android WebView), geolocation (same), Supabase auth, Tiptap notes, Ask AI, Plaid Link — should work by just... loading.

## 2. What has to actually change

### 2.1 Native push notifications (the one real engineering project here)

This is the load-bearing piece of the whole effort. Schuaz's existing push pipeline (`public/sw.js`, `hooks/use-push-notifications.ts`, `lib/push/send.ts`, 7 cron send jobs, `notification_preferences`/`event_notification_log`) is standards-based **Web Push** — a service worker registers a `PushSubscription` with the browser's own push service (Apple's/Google's web push endpoints), and `web-push`+VAPID sends to it. This works today in mobile Safari (as an installed PWA, iOS 16.4+) and Android Chrome.

It does **not** work the same way inside a Capacitor-wrapped WKWebView. A WKWebView is not "installed Safari" — Apple does not deliver standards-based Web Push into an app's embedded WebView. Real native push there requires going through **APNs** (iOS) and **FCM** (Android) via Capacitor's own `@capacitor/push-notifications` plugin — a parallel, different pipeline from the Web Push one already built, not a drop-in replacement for it (the existing Web Push path still needs to keep working for anyone using Schuaz in a mobile/desktop browser).

Checked the Vercel Marketplace first per usual practice (`vercel integration discover --category messaging`) — nothing there covers mobile push (Resend/email only), so this follows the same "direct external API, no marketplace product exists" path already established for Open-Meteo and UPCitemdb. **Firebase Cloud Messaging (FCM)** is the recommendation: it's free, and it's what Capacitor's push-notifications plugin is built around for *both* platforms — FCM delivers to Android directly, and relays to APNs for iOS from one unified send call, so the server only ever talks to one API instead of implementing raw APNs separately.

Concrete pieces:
- New Supabase table, e.g. `device_push_tokens` (household_id, user_id, platform `'ios'|'android'`, fcm_token, created_at) — parallel to the existing `push_subscriptions` table, not a replacement.
- `@capacitor/push-notifications` registers on app launch (native only — gated behind `Capacitor.isNativePlatform()`), posts the token to a new `/api/v1/push/register-device` route.
- `lib/push/send.ts`'s `sendPushToUser()` extended to *also* deliver to any FCM tokens for that user, alongside the existing Web Push subscriptions — every existing cron job (`send-due-bills`, `send-weather-alerts`, etc.) gets native delivery for free once this one shared function handles it, no per-job changes needed.
- Needs: a Firebase project (free tier), and — since APNs delivery goes through it — an Apple Push Notifications Auth Key, which needs an active Apple Developer Program membership (see §4).
- Tap-to-open: the plugin's notification-tap listener just navigates the already-loaded WebView (`window.location.href = url`), no universal-links/deep-linking infrastructure needed — it's the same page navigation the existing `sw.js` `notificationclick` handler already does for the web case.

### 2.2 Everything else is small

- **Camera** (capture flows) and **geolocation** (household location, "Use my location") already use standard web APIs (`getUserMedia`, `navigator.geolocation`) that work inside Capacitor's WebView on both platforms. Plan: ship with the existing web APIs unchanged; only reach for `@capacitor/camera`/`@capacitor/geolocation` native plugins later if real-device testing turns up a rough edge (permission-prompt wording, a codec issue) — no reason to swap working code preemptively.
- **Native permission strings**: `NSCameraUsageDescription`/`NSLocationWhenInUseUsageDescription` (iOS `Info.plist`) and `CAMERA`/`ACCESS_FINE_LOCATION` (Android `AndroidManifest.xml`) need real, App-Review-acceptable copy — new work, but small.
- **The existing `sw.js`/Web Push UI** (Settings > Notifications' enable/disable, `usePushNotifications` hook) stays exactly as-is for the browser case; the native build's equivalent screen swaps in the native registration flow instead, gated on `Capacitor.isNativePlatform()`.
- **Safe-area handling** is already used throughout (`env(safe-area-inset-top)` in 30+ files) — a good sign this UI already reads as "native-ready" rather than needing a retrofit for notches/home indicators.
- **App icons/splash**: real icon art already exists (`public/icons/*`, `shohaz-icon.svg`) and just needs running through `@capacitor/assets` to generate every native size — no new design work.

### 2.3 App Store review risk — worth naming plainly

Apple's App Review Guideline 4.2 ("Minimum Functionality") can reject an app that's "just a web site wrapped in a WebView" with no real native value. A wrapped app with working native push notifications, camera capture, and geolocation is generally an easier pass than a bare wrapper — this app clears that bar once §2.1 ships — but it's a real, subjective risk to budget review-cycle time for, not a guarantee. Google Play is materially more permissive here.

## 3. What does NOT change

Every server component, API route (`/api/v1/*`), Supabase Auth session (cookie-based, `@supabase/ssr` — WKWebView keeps a persistent cookie jar like mobile Safari does), Vercel Cron job, the AI Gateway calls, Plaid Link, Tiptap notes editor, and every existing page ships unmodified. This is the entire value of the "live remote URL" approach over a rewrite.

## 4. Real-world dependencies (not engineering, but blocking)

- **Google Play Console** ($25 one-time) — already set up, no blocker on the Android leg.
- **Apple Developer Program** ($99/yr) — not yet enrolled; not needed for the Android-first work in §5, but is a real lead-time item (enrollment can take a day or two to process) to start before the iOS phase actually begins, since it gates a real device build, the APNs Auth Key push depends on, TestFlight, and App Store submission itself.
- **Bundle/package identifier**: `com.schuaz.app` — reverse-DNS of the app's own domain (schuaz.com), decided after an initial `com.muatasim.schuaz` was caught and corrected before any store submission (changing it after one means a new app listing, not a rename).
- **Privacy policy**: already exists at `/privacy` — both stores require a reachable URL for it; worth a review pass for mobile-specific disclosures (camera, location, push) before submission, but no new page needed.

## 5. Phased plan

**Android first**, deliberately — proves the whole wrapper + native push pipeline against one platform's review process before taking on Apple's stricter Guideline 4.2 pass. A Google Play Console account already exists, so there's no account-enrollment blocker on this path at all; an Apple Developer Program membership still needs enrolling before the iOS phase (§4) — budget that lead time before it's actually needed, not on the critical path for Android.

1. **Feasibility spike (Android)** — `npm i @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init`, `npx cap add android`, point `server.url` at production, run in an Android emulator (and a real device if handy). Verify: pages load, Supabase session survives an app relaunch, a capture flow's camera prompt works, geolocation's "Use my location" works, scrolling/perceived performance is acceptable. No native push yet — this phase is purely "does the wrapper work at all."
2. **Native push, Android leg** (§2.1) — Firebase project, `device_push_tokens` migration, `@capacitor/push-notifications` integration (Android/FCM side), `sendPushToUser()` extended, tested end-to-end on a real Android device.
3. **Android store readiness** — generated icons/splash, permission-string copy, Play internal testing track, screenshots, store listing, submit.
4. **iOS repeat** — once Android is live/stable: enroll in Apple Developer Program, `npx cap add ios`, same feasibility spike, the push work's already-built FCM relay just needs the APNs Auth Key uploaded to the same Firebase project, TestFlight, App Store submission (budget real time for §2.3's review risk here).
5. **Polish (post-launch, not blocking either platform)** — haptics (`@capacitor/haptics`) on key actions (mark-task-complete, save), native share sheet, app icon badge count wired to unread notifications.

## 6. Open questions

None currently — bundle identifier is resolved (§4).
