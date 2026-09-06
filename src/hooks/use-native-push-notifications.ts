"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { useInventoryStore } from "@/lib/store";
import type { PushSupportState } from "@/hooks/use-push-notifications";

/**
 * Native-app counterpart to usePushNotifications (docs/Mobile App
 * Addendum.md §2.1) — registers for FCM delivery via
 * @capacitor/push-notifications instead of the browser's PushManager,
 * and POSTs the resulting token to /api/v1/push/register-device.
 * `Capacitor.isNativePlatform()` is false everywhere except inside the
 * actual Capacitor-wrapped app — including this same code running in a
 * regular browser tab — so this hook is always safe to call
 * unconditionally; Settings > Notifications picks between this hook's UI
 * and usePushNotifications' based on that same check, rather than either
 * hook trying to cover both cases itself.
 */
export function useNativePushNotifications() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const [state, setState] = useState<PushSupportState>("checking");
  const tokenRef = useRef<string | null>(null);

  // Reconcile on mount: an already-granted permission (a previous
  // session) re-registers silently to keep the token fresh — FCM tokens
  // can rotate — without a second permission prompt. `queueMicrotask`
  // defers the setState out of the effect body itself, same pattern
  // documented on desktop-sidebar.tsx's own reconcile-on-mount effect.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    let cancelled = false;
    (async () => {
      const permStatus = await PushNotifications.checkPermissions();
      if (cancelled) return;
      if (permStatus.receive === "denied") {
        setState("denied");
      } else if (permStatus.receive === "granted") {
        await PushNotifications.register();
      } else {
        setState("not-subscribed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !householdId) return;

    const registrationHandle = PushNotifications.addListener("registration", (token: Token) => {
      tokenRef.current = token.value;
      setState("subscribed");
      fetch("/api/v1/push/register-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ householdId, platform: Capacitor.getPlatform(), fcmToken: token.value }),
      }).catch((error) => console.error("useNativePushNotifications: failed to register device:", error));
    });

    const errorHandle = PushNotifications.addListener("registrationError", (error) => {
      console.error("useNativePushNotifications: registration failed:", error);
      setState("denied");
    });

    // Tap-to-open — same role sw.js's notificationclick handler plays for
    // Web Push. The WebView is already the whole app, so "opening" a
    // notification is just navigating it, no deep-link/universal-link
    // infrastructure needed (see lib/push/send.ts's sendFcmToUser, which
    // sets this same `data.url`).
    const tapHandle = PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      const url = (action.notification.data as { url?: string } | undefined)?.url;
      if (url) window.location.href = url;
    });

    return () => {
      registrationHandle.then((h) => h.remove());
      errorHandle.then((h) => h.remove());
      tapHandle.then((h) => h.remove());
    };
  }, [householdId]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!Capacitor.isNativePlatform()) return { ok: false, error: "Not running in the native app." };
    const permStatus = await PushNotifications.requestPermissions();
    if (permStatus.receive !== "granted") {
      setState("denied");
      return { ok: false, error: "Notifications were blocked — enable them in your device's Settings to turn this back on." };
    }
    await PushNotifications.register();
    return { ok: true };
  }, []);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (tokenRef.current) {
      try {
        await fetch("/api/v1/push/unregister-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fcmToken: tokenRef.current }),
        });
      } catch (error) {
        console.error("useNativePushNotifications: failed to unregister device:", error);
      }
    }
    await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
    tokenRef.current = null;
    setState("not-subscribed");
    return { ok: true };
  }, []);

  return { state, subscribe, unsubscribe };
}
