"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token, type PushNotificationSchema, type ActionPerformed } from "@capacitor/push-notifications";
import { useInventoryStore } from "@/lib/store";
import { setNativePushToken } from "@/lib/native-push-token";

/**
 * Native push's passive listeners (docs/Mobile App Addendum.md §2.1) —
 * split out of use-native-push-notifications.ts (Settings > Notifications'
 * enable/disable UI) and mounted globally here instead, same "always
 * mounted regardless of what page is showing" reasoning as
 * NativeAuthDeepLinkListener. Found this gap testing a real send: a
 * Capacitor addListener() callback only fires while its owning component
 * is mounted, and nobody keeps Settings open — a notification tap or a
 * foreground receipt needs to work from whatever page the app happens to
 * be on, not just while Settings is the one on screen. Registering the
 * device token lives here too for the same reason: an FCM token can
 * rotate at any time, not just around the moment someone taps "Enable."
 *
 * A no-op everywhere except the native app, same as every other
 * Capacitor.isNativePlatform()-gated component in this app.
 */
export function NativePushNotificationListener() {
  const router = useRouter();
  const householdId = useInventoryStore((s) => s.currentHouseholdId);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Re-registers silently on every app start once permission was
    // already granted in an earlier session — keeps the token fresh
    // (FCM tokens can rotate) without a second permission prompt. First-
    // time permission requests only ever come from subscribe() below
    // (use-native-push-notifications.ts), wired to an explicit button.
    PushNotifications.checkPermissions().then((status) => {
      if (status.receive === "granted") PushNotifications.register();
    });

    const registrationHandle = PushNotifications.addListener("registration", (token: Token) => {
      setNativePushToken(token.value);
      if (!householdId) return;
      fetch("/api/v1/push/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, platform: Capacitor.getPlatform(), fcmToken: token.value }),
      }).catch((error) => console.error("NativePushNotificationListener: failed to register device:", error));
    });

    const errorHandle = PushNotifications.addListener("registrationError", (error) => {
      console.error("NativePushNotificationListener: registration failed:", error);
    });

    // Foreground receipt — unlike Web Push's own showNotification()
    // (sw.js), which always shows a system-tray notification regardless
    // of tab focus, Android/iOS don't show one on their own while the
    // app already has focus. A toast is this app's existing "something
    // happened" surface everywhere else, so it's the natural fallback
    // here — otherwise a push sent while the app happens to be open
    // would silently vanish, which is exactly what testing a real send
    // first surfaced.
    const receivedHandle = PushNotifications.addListener("pushNotificationReceived", (notification: PushNotificationSchema) => {
      const url = (notification.data as { url?: string } | undefined)?.url;
      toast(notification.title || "Schuaz", {
        description: notification.body,
        action: url ? { label: "Open", onClick: () => router.push(url) } : undefined,
      });
    });

    // Tap on a system-tray notification (app backgrounded/killed when it
    // arrived) — same role sw.js's notificationclick handler plays for
    // Web Push.
    const tapHandle = PushNotifications.addListener("pushNotificationActionPerformed", (action: ActionPerformed) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      if (url) router.push(url);
    });

    return () => {
      registrationHandle.then((h) => h.remove());
      errorHandle.then((h) => h.remove());
      receivedHandle.then((h) => h.remove());
      tapHandle.then((h) => h.remove());
    };
  }, [router, householdId]);

  return null;
}
