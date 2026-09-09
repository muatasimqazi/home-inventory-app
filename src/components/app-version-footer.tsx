"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App } from "@capacitor/app";

/**
 * Native-only "Schuaz 1.0 (1)" footer — real version/build straight from
 * the installed app (App.getInfo(), @capacitor/app — version is Android's
 * versionName, build is versionCode), useful for support ("which build do
 * you have installed") especially during Play Store rollout. Nothing
 * shown on web at all: this app deploys continuously on every push, so
 * there's no real version number to show there — a hardcoded "1.0.0"
 * would just be misleading rather than helpful.
 */
export function AppVersionFooter() {
  const [info, setInfo] = useState<{ version: string; build: string } | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    App.getInfo().then((result) => setInfo({ version: result.version, build: result.build }));
  }, []);

  if (!info) return null;

  return (
    <p className="pt-1 text-center text-micro text-muted-foreground">
      Schuaz {info.version} ({info.build})
    </p>
  );
}
