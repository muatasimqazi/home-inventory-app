/**
 * Builds the shareable/scannable URL a QR code or NFC tag should resolve
 * to for a container. Was hardcoded to `https://schuaz.com/...` in three
 * places (a domain that isn't this app's real deployed origin), pointing
 * at a `/c/[token]` route that didn't exist — every scan 404'd. Mirrors
 * the `NEXT_PUBLIC_APP_URL ?? window.location.origin` pattern already
 * used for the OAuth callback in sign-in/page.tsx.
 */
/**
 * The app's own origin, scheme included — NEXT_PUBLIC_APP_URL is configured
 * as a bare domain (no scheme) in this project's env, and used raw that
 * isn't a valid absolute URL (breaks anything that requires a real URI
 * rather than guessing from a bare domain string: NFC NDEF URI records, QR
 * scanners, OAuth redirect validation).
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.startsWith("http://") || configured.startsWith("https://") ? configured : `https://${configured}`;
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function containerResolveUrl(tagToken: string): string {
  return `${appOrigin()}/c/${tagToken}`;
}
