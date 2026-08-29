// Shohaz's service worker — scoped to push notifications only (Household
// Hub Addendum §5: "scoped initially to push handling only, not a full
// offline/caching strategy, that's a separate, larger decision, out of
// scope here"). No fetch/cache handling on purpose — this does not make
// Shohaz offline-capable, it exists solely so the browser has a worker
// registered to receive `push` events and show a Notification from them.

self.addEventListener("install", () => {
  // Activate immediately rather than waiting for every open tab to close —
  // there's no cached-asset versioning to worry about invalidating here.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Shohaz", body: event.data.text() };
  }

  const title = payload.title || "Shohaz";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-192x192.png",
    // Carries the URL to open on click — set by the send job per
    // notification (e.g. a specific bill's Recurring Bills page).
    data: { url: payload.url || "/" },
    tag: payload.tag, // same tag replaces an unread notification of the same kind rather than stacking duplicates
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus an already-open Shohaz tab instead of opening a new one, if
      // one exists — same "don't multiply tabs" courtesy most PWAs give.
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
