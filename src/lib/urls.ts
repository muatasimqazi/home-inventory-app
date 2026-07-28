/**
 * Builds the shareable/scannable URL a QR code or NFC tag should resolve
 * to for a container. Was hardcoded to `https://shohaz.app/...` in three
 * places (a domain that isn't this app's real deployed origin), pointing
 * at a `/c/[token]` route that didn't exist — every scan 404'd. Mirrors
 * the `NEXT_PUBLIC_APP_URL ?? window.location.origin` pattern already
 * used for the OAuth callback in sign-in/page.tsx.
 */
export function containerResolveUrl(tagToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${appUrl}/c/${tagToken}`;
}
