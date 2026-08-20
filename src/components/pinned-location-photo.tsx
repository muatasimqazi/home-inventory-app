"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icon";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { PINNED_LOCATION_CATEGORY_ICONS } from "@/lib/pinned-locations";
import type { PinnedLocationCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

interface PinnedLocationPhotoProps {
  photoPath: string | null;
  category: PinnedLocationCategory;
  className?: string;
  iconClassName?: string;
}

/**
 * Renders a Home Map pin's photo via a short-lived signed URL — the
 * "attachments" bucket is private (see PinnedLocation's own doc comment in
 * src/lib/types.ts for why), so there's no public URL to point an <img> at
 * directly the way PhotoThumb does for item/location/container photos.
 * Same on-demand-signed-URL pattern as item-attachments.tsx and
 * transaction-detail-sheet.tsx. Falls back to a category icon when there's
 * no photo yet, or while the URL is still resolving.
 */
export function PinnedLocationPhoto({ photoPath, category, className, iconClassName }: PinnedLocationPhotoProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!photoPath) {
        if (!cancelled) setUrl(null);
        return;
      }
      const { data } = await getSupabaseBrowserClient().storage.from("attachments").createSignedUrl(photoPath, 300);
      if (!cancelled) setUrl(data?.signedUrl ?? null);
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  if (url) {
    return (
      <div className={cn("overflow-hidden rounded-2xl bg-brand-100", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="size-full object-cover" />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center justify-center rounded-2xl bg-brand-100 text-yellow", className)}>
      <Icon name={PINNED_LOCATION_CATEGORY_ICONS[category]} size={26} className={iconClassName} />
    </div>
  );
}
