"use client";

import { useCallback, useEffect, useState } from "react";
import { useInventoryStore } from "@/lib/store";

/** Web Push's applicationServerKey wants a raw Uint8Array, not the base64url string VAPID keys are generated/stored as — standard conversion boilerplate every Web Push integration needs. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from(rawData, (char) => char.charCodeAt(0));
}

export type PushSupportState = "checking" | "unsupported" | "denied" | "subscribed" | "not-subscribed";

/**
 * Web Push subscribe/unsubscribe (docs/Household Hub Addendum.md §5) —
 * registers the service worker on mount (cheap, no permission prompt of
 * its own), but never requests Notification permission except from
 * `subscribe()`, which every caller must only ever wire to a real button
 * click ("an explicit, user-initiated permission request... never
 * requested on page load" per the addendum, and the only pattern iOS
 * Safari's push permission model tolerates well).
 */
export function usePushNotifications() {
  const householdId = useInventoryStore((s) => s.currentHouseholdId);
  const [state, setState] = useState<PushSupportState>("checking");
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState("unsupported");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (cancelled) return;
        setRegistration(reg);
        if (Notification.permission === "denied") {
          setState("denied");
          return;
        }
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "subscribed" : "not-subscribed");
      } catch (error) {
        console.error("usePushNotifications: service worker registration failed:", error);
        if (!cancelled) setState("unsupported");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!registration || !householdId) return { ok: false, error: "Not ready yet — try again in a moment." };
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) return { ok: false, error: "Push isn't configured on this deployment." };

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setState("denied");
      return { ok: false, error: permission === "denied" ? "Notifications were blocked — enable them in your browser/OS settings to turn this back on." : "Permission not granted." };
    }

    try {
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // TS's DOM lib is overly strict about Uint8Array<ArrayBufferLike>
        // vs the ArrayBuffer-backed BufferSource it wants here — the
        // runtime value is a perfectly valid BufferSource either way.
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      });
      const json = subscription.toJSON();
      const res = await fetch("/api/v1/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          endpoint: json.endpoint,
          keys: json.keys,
          deviceLabel: navigator.userAgent.slice(0, 120),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { ok: false, error: data.error ?? "Couldn't save that subscription." };
      }
      setState("subscribed");
      return { ok: true };
    } catch (error) {
      console.error("usePushNotifications: subscribe failed:", error);
      return { ok: false, error: "Couldn't turn on notifications. Please try again." };
    }
  }, [registration, householdId]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!registration) return { ok: false, error: "Not ready yet." };
    try {
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();
        await fetch("/api/v1/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setState("not-subscribed");
      return { ok: true };
    } catch (error) {
      console.error("usePushNotifications: unsubscribe failed:", error);
      return { ok: false, error: "Couldn't turn off notifications. Please try again." };
    }
  }, [registration]);

  return { state, subscribe, unsubscribe };
}
