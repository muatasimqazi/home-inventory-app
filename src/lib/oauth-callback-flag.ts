"use client";

// Coordinates two components that otherwise have no shared state:
// native-auth-deep-link-listener.tsx (mounted globally, root layout) and
// sign-in/page.tsx's own continueWithGoogle()/continueWithApple(). Both
// care about the *same* @capacitor/browser 'browserFinished' event, but
// for opposite reasons that need telling apart — it fires when the OAuth
// browser sheet closes for *either* of two very different reasons:
//   1. A real callback arrived (com.schuaz.app://auth/callback?code=...)
//      and the deep-link listener called Browser.close() itself as the
//      first step of handling it, right before the async code exchange.
//   2. The user dismissed the sheet on their own — cancelled, backed
//      out, no callback ever came.
// Only #2 should send the sign-in page back to its default buttons (it
// was otherwise stuck on "Signing in…" forever — no callback was ever
// coming to snap it out of that). #1 needs the *opposite*: leave
// "Signing in…" showing through the code exchange, right up until the
// router.push that follows moments later.
//
// Plain module state, same reasoning as native-push-token.ts's own
// shared slot — this is the only place either side needs it, and both
// run in the same WebView/JS runtime regardless of which component tree
// currently has them mounted.
let callbackReceived = false;

/** Called by native-auth-deep-link-listener.tsx as the first thing it does once it recognizes a real callback URL, before its own Browser.close(). */
export function markOAuthCallbackReceived(): void {
  callbackReceived = true;
}

/** Checked by sign-in/page.tsx's own 'browserFinished' listener; reset after each check so a *second* browser session (retrying sign-in after a cancel) starts with a clean flag. */
export function consumeOAuthCallbackReceived(): boolean {
  const value = callbackReceived;
  callbackReceived = false;
  return value;
}
