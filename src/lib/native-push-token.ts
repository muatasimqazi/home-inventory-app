"use client";

// Tiny shared slot for the current device's FCM token — written by
// native-push-notification-listener.tsx's 'registration' handler (global,
// always mounted, docs/Mobile App Addendum.md §2.1), read by
// use-native-push-notifications.ts's unsubscribe() (Settings > Notifications'
// enable/disable UI) so it knows which token to tell the server to forget.
// Plain module state, not a zustand store slice — this is the only place
// either side needs it, it never needs to trigger a re-render, and both
// sides run in the same WebView/JS runtime regardless of which component
// tree currently has them mounted.
let token: string | null = null;

export function getNativePushToken(): string | null {
  return token;
}

export function setNativePushToken(value: string | null): void {
  token = value;
}
