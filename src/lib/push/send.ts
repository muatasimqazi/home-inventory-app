import "server-only";
import webpush from "web-push";
import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import type { SupabaseClient } from "@supabase/supabase-js";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) {
    throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_SUBJECT must be set.");
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /** Same tag replaces an unread notification of the same kind rather than stacking duplicates — e.g. re-sending the same bill's reminder. */
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
}

/**
 * Lazily builds the Firebase Admin app used for native push (FCM), or
 * returns null if it isn't configured yet — unlike Web Push's VAPID
 * check above, this does NOT throw, since native push (docs/Mobile App
 * Addendum.md §2.1) is still being rolled out and shouldn't break the
 * already-shipped Web Push path for every household until it's fully
 * wired up. `undefined` (not yet checked) is distinguished from `null`
 * (checked, not configured) so a missing env var isn't re-read on every
 * call, same one-time-check shape as Web Push's `configured` flag above.
 */
let firebaseApp: App | null | undefined;

function getFirebaseApp(): App | null {
  if (firebaseApp !== undefined) return firebaseApp;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Service account keys are downloaded with real newlines but env vars
  // typically only preserve them as literal "\n" — same escaping most
  // FIREBASE_PRIVATE_KEY guides call out.
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) {
    firebaseApp = null;
    return null;
  }

  firebaseApp = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return firebaseApp;
}

interface DeviceTokenRow {
  id: string;
  fcm_token: string;
}

/**
 * Sends one push payload to every native (Capacitor) app a household
 * member has registered (device_push_tokens, 0056_device_push_tokens.sql)
 * — the FCM counterpart to the Web Push loop below. A dead token
 * (`registration-token-not-registered`/`invalid-registration-token` — the
 * app was uninstalled or the token rotated) is deleted rather than
 * retried forever, same "don't let one bad device stop the rest of the
 * household" posture Web Push's own loop already has.
 */
export async function sendFcmToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  const app = getFirebaseApp();
  if (!app) return { sent: 0, removed: 0 };

  const { data: tokens } = await admin.from("device_push_tokens").select("id, fcm_token").eq("user_id", userId);
  const messaging = getMessaging(app);
  let sent = 0;
  let removed = 0;

  for (const row of (tokens ?? []) as DeviceTokenRow[]) {
    try {
      await messaging.send({
        token: row.fcm_token,
        notification: { title: payload.title, body: payload.body },
        // Read by the native app's push-tap listener (hooks/use-native-
        // push.ts) to navigate the WebView — the same role sw.js's
        // notificationclick handler plays for Web Push.
        data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
      });
      sent++;
      await admin.from("device_push_tokens").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);
    } catch (error) {
      const code = (error as { code?: string }).code;
      // invalid-argument covers a token that was never FCM-shaped at all
      // (e.g. a raw APNs hex token stored before the iOS FCM-exchange fix
      // — docs/Mobile App Addendum.md §2.1 — landed), not just one that
      // was valid and has since expired/uninstalled
      // (registration-token-not-registered/invalid-registration-token) —
      // both are equally dead ends, so both get cleaned up the same way
      // rather than erroring on every future send forever.
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        await admin.from("device_push_tokens").delete().eq("id", row.id);
        removed++;
      } else {
        console.error(`sendFcmToUser: failed to send to device ${row.id}:`, error);
      }
    }
  }

  return { sent, removed };
}

/**
 * Sends one push payload to every device a household member has
 * registered — both standards-based Web Push (browser/PWA,
 * push_subscriptions) and native Capacitor apps (FCM,
 * device_push_tokens; see sendFcmToUser above). Runs on the admin client
 * (no signed-in user for a cron-triggered send) — same trust boundary as
 * every other scheduled job in this app. A dead subscription (410 Gone —
 * the browser unsubscribed or the device is gone) is deleted rather than
 * retried forever; any other failure is logged and skipped, never
 * thrown, so one bad device doesn't stop the rest of the household from
 * being notified.
 */
export async function sendPushToUser(admin: SupabaseClient, userId: string, payload: PushPayload): Promise<{ sent: number; removed: number }> {
  ensureConfigured();

  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh_key, auth_key").eq("user_id", userId);
  let sent = 0;
  let removed = 0;

  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh_key, auth: sub.auth_key } },
        JSON.stringify(payload)
      );
      sent++;
      await admin.from("push_subscriptions").update({ last_seen_at: new Date().toISOString() }).eq("id", sub.id);
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from("push_subscriptions").delete().eq("id", sub.id);
        removed++;
      } else {
        console.error(`sendPushToUser: failed to send to subscription ${sub.id}:`, error);
      }
    }
  }

  const fcmResult = await sendFcmToUser(admin, userId, payload);
  sent += fcmResult.sent;
  removed += fcmResult.removed;

  return { sent, removed };
}
