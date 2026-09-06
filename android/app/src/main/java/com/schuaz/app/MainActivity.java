package com.schuaz.app;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onPause() {
    super.onPause();
    // Fix for "signed in, then logged out again after reopening the
    // app" — Android's WebView caches cookie writes in memory and only
    // periodically flushes them to disk on its own. Supabase's session
    // (@supabase/ssr's createBrowserClient, lib/supabase/client.ts) is a
    // cookie set via a plain document.cookie write from inside the
    // WebView's JS, so it's subject to that same caching. A backgrounded
    // app can have its whole process killed by Android under real memory
    // pressure well before that periodic flush would have run — observed
    // happening in this exact app while testing the Google sign-in
    // Custom Tab flow (docs/Mobile App Addendum.md) — silently losing a
    // just-issued session cookie that was never durably written. Forcing
    // a flush on every pause (not just onStop, which fires later) closes
    // that window as early as possible, before the OS has a chance to
    // reclaim the process.
    CookieManager.getInstance().flush();
  }
}
