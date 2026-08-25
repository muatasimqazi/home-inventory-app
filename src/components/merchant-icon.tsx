"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface MerchantIconProps {
  /** Transaction.merchantLogoUrl — a real 100×100 PNG from Plaid, when Plaid has one. Null for every non-Plaid transaction and for a Plaid transaction Plaid itself has no logo for — see that field's own comment in lib/types.ts. */
  logoUrl: string | null;
  /** Used for the fallback's initial and its accessible label either way. */
  merchantName: string | null;
  className?: string;
}

/**
 * A real merchant logo when one's available; otherwise a brand-tinted
 * circle with the merchant's first letter — same "real image, else a
 * designed fallback, never a blank box" shape PhotoThumb already
 * established for item/container/location photos, sized and shaped for
 * a transaction row instead (round, not rounded-2xl — a merchant logo
 * reads as a brand mark, not a photo).
 */
export function MerchantIcon({ logoUrl, merchantName, className }: MerchantIconProps) {
  // Same reset-during-render idiom PhotoThumb uses (React's documented
  // "adjust state when a prop changes" pattern) — a row can go from one
  // transaction's logo to another's without remounting (e.g. a virtualized
  // list, or this same DOM node re-rendering for a different row).
  const [loaded, setLoaded] = useState(false);
  const [prevUrl, setPrevUrl] = useState(logoUrl);
  if (logoUrl !== prevUrl) {
    setPrevUrl(logoUrl);
    setLoaded(false);
  }

  if (logoUrl) {
    return (
      <div className={cn("relative shrink-0 overflow-hidden rounded-full bg-surface-muted", className)}>
        {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt=""
          onLoad={() => setLoaded(true)}
          // A failed load (dead link, network error) clears the skeleton
          // instead of pulsing forever — same reasoning as PhotoThumb's
          // own onError. Nothing else to do here since there's no
          // fallback-within-fallback; a blank/broken img at that point
          // reads clearly enough as "no logo" without extra handling.
          onError={() => setLoaded(true)}
          className={cn("size-full object-cover transition-opacity duration-200", loaded ? "opacity-100" : "opacity-0")}
        />
      </div>
    );
  }

  const initial = merchantName?.trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-caption font-semibold text-yellow-text", className)}
      aria-hidden
    >
      {initial}
    </div>
  );
}
