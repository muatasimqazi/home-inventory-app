"use client";

import { useCallback, useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { PushSupportState } from "@/hooks/use-push-notifications";
import { getNativePushToken, setNativePushToken } from "@/lib/native-push-token";

/**
 * Settings > Notifications' native-app counterpart to
 * usePushNotifications — the interactive half (enable/disable UI state,
 * the subscribe/unsubscribe buttons call). The passive listeners
 * (registration, notification taps, foreground receipt) live in
 * components/native-push-notification-listener.tsx instead, mounted
 * globally at the root layout rather than scoped to this hook's own
 * lifetime — a Capacitor addListener() callback only fires while its
 * owning component is mounted, and nobody keeps this Settings page open,
 * so those need to keep working from whatever page the app is actually
 * on. This hook still adds its own lightweight 'registration' listener
 * below, but only to flip local UI state to "subscribed" while this page
 * happens to be visible — the actual device-token POST is the global
 * listener's job, not this one's, so it isn't duplicated here.
 *
 * `Capacitor.isNativePlatform()` is false everywhere except inside the
 * actual Capacitor-wrapped app — including this same code running in a
 * regular browser tab — so this hook is always safe to call
 * unconditionally; Settings > Notifications picks between this hook's UI
 * and usePushNotifications' based on that same check, rather than either
 * hook trying to cover both cases itself.
 */
export function useNativePushNotifications() {
  const [state, setState] = useState<PushSupportState>("checking");

  // Reconcile on mount: an already-granted permission (a previous
  // session) reflects as "subscribed" immediately, without waiting on a
  // fresh registration round trip. `queueMicrotask` defers the setState
  // out of the effect body itself, same pattern documented on
  // desktop-sidebar.tsx's own reconcile-on-mount effect.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      queueMicrotask(() => setState("unsupported"));
      return;
    }
    let cancelled = false;
    (async () => {
      const permStatus = await PushNotifications.checkPermissions();
      if (cancelled) return;
      if (permStatus.receive === "denied") setState("denied");
      else if (permStatus.receive === "granted") setState("subscribed");
      else setState("not-subscribed");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handle = PushNotifications.addListener("registration", () => {
      setState("subscribed");
    });
    return () => {
      handle.then((h) => h.remove());
    };
  }, []);

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
    const token = getNativePushToken();
    if (token) {
      try {
        await fetch("/api/v1/push/unregister-device", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fcmToken: token }),
        });
      } catch (error) {
        console.error("useNativePushNotifications: failed to unregister device:", error);
      }
    }
    await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
    setNativePushToken(null);
    setState("not-subscribed");
    return { ok: true };
  }, []);

  return { state, subscribe, unsubscribe };
}
