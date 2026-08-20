import "server-only";
import webpush from "web-push";
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
 * Sends one push payload to every device a household member has
 * registered. Runs on the admin client (no signed-in user for a
 * cron-triggered send) — same trust boundary as every other scheduled
 * job in this app. A dead subscription (410 Gone — the browser
 * unsubscribed or the device is gone) is deleted rather than retried
 * forever; any other failure is logged and skipped, never thrown, so one
 * bad device doesn't stop the rest of the household from being notified.
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

  return { sent, removed };
}
