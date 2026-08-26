"use client";

import { useEffect } from "react";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { Icon } from "@/components/icon";
import { useLightboxStore } from "@/lib/lightbox-store";
import { coverPhotoUrl } from "@/lib/cover-photo";
import { cn } from "@/lib/utils";

/**
 * Global full-screen photo viewer — one instance mounted once in
 * app/layout.tsx (not per-page) so any component, anywhere, can open it
 * via useLightboxStore().openLightbox(...) without prop-drilling a
 * "which photo is enlarged" state up to some shared ancestor. Renders
 * nothing when closed.
 *
 * Zoom/pan is react-zoom-pan-pinch rather than hand-rolled pointer math —
 * multi-touch pinch, wheel-zoom, and double-tap-to-zoom are each their
 * own source of cross-browser gesture bugs to get right, and this is a
 * small, dependency-free, actively maintained library built for exactly
 * this. `key={index}` on TransformWrapper remounts it (and so resets
 * zoom/pan to initialScale) whenever the viewed photo changes — simpler
 * and more robust than imperatively calling resetTransform() on a ref.
 */
export function PhotoLightbox() {
  const open = useLightboxStore((s) => s.open);
  const photos = useLightboxStore((s) => s.photos);
  const index = useLightboxStore((s) => s.index);
  const close = useLightboxStore((s) => s.close);
  const next = useLightboxStore((s) => s.next);
  const prev = useLightboxStore((s) => s.prev);
  const setIndex = useLightboxStore((s) => s.setIndex);

  // Escape/arrow keys, and lock the page from scrolling underneath —
  // same "only while open" pattern as the app's bottom sheets
  // (use-keyboard-inset.ts), just via a plain listener here since this
  // isn't Radix-based (Radix's own focus-trap/outside-click machinery
  // would fight react-zoom-pan-pinch's own pointer handling).
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close, next, prev]);

  if (!open || photos.length === 0) return null;

  const path = photos[index];
  const hasMultiple = photos.length > 1;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/95 animate-in fade-in duration-150"
      // Closes on a tap that lands on the backdrop itself — a plain click
      // (no drag) on the image or its transform wrapper still bubbles up
      // here, so this only fires target===currentTarget, i.e. genuinely
      // empty space around the photo.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3">
        <span className="text-caption font-medium text-white/70">{hasMultiple ? `${index + 1} / ${photos.length}` : ""}</span>
        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="tap-target flex size-10 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <TransformWrapper key={index} initialScale={1} minScale={1} maxScale={4} centerOnInit doubleClick={{ mode: "toggle" }}>
          <TransformComponent wrapperClass="!size-full" contentClass="!size-full !flex !items-center !justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={coverPhotoUrl(path)} alt="" className="max-h-full max-w-full object-contain" draggable={false} />
          </TransformComponent>
        </TransformWrapper>

        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={prev}
              aria-label="Previous photo"
              className="tap-target absolute left-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
            <button
              type="button"
              onClick={next}
              aria-label="Next photo"
              className="tap-target absolute right-2 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white"
            >
              <Icon name="chevronRight" size={20} />
            </button>
          </>
        )}
      </div>

      {hasMultiple && (
        <div className="flex items-center justify-center gap-1.5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3">
          {photos.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1}`}
              className={cn("size-1.5 rounded-full", i === index ? "bg-white" : "bg-white/40")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
