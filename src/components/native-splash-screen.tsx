"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";

/**
 * Native-app-only. Schuaz's native shells load the real, live production
 * deployment over the network (docs/Mobile App Addendum.md — server.url,
 * not a bundled static export), so there's a real gap between the native
 * launch screen handing off and the WebView actually having something to
 * show — without capacitor.config.ts's launchAutoHide: false plus this
 * component, Capacitor hides the branded launch screen the instant the
 * WebView is *created*, not once it has *content*, leaving a blank white
 * screen for however long the network load takes. Seen directly, over
 * and over, capturing screenshots this same session. Mounting here (root
 * layout, same place every other native-only global listener lives)
 * calls SplashScreen.hide() once this component's effect has actually
 * run — i.e. once React has mounted real page content into the DOM, not
 * before.
 */
export function NativeSplashScreen() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void SplashScreen.hide();
  }, []);

  return null;
}
