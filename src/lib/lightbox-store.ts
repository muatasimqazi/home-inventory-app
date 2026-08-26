"use client";

import { create } from "zustand";

interface LightboxState {
  photos: string[];
  index: number;
  open: boolean;
  /** Opens the full-screen viewer on `photos[index]` — `photos` are storage
   * paths (coverPhotoUrl(...) resolves them), same convention every caller
   * (PhotoThumb, ItemPhotoGallery, WardrobeItemCard, ...) already stores
   * them in. A single photo is just `[path]`. */
  openLightbox: (photos: string[], index?: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  setIndex: (index: number) => void;
}

/**
 * Ephemeral UI-only state (which photo is being viewed full-screen, if
 * any) — deliberately its own tiny store, not folded into the big
 * inventory store (lib/store.ts): nothing here persists, syncs to
 * Supabase, or survives a refresh, and it needs to be readable from one
 * globally-mounted <PhotoLightbox/> (app/layout.tsx) regardless of which
 * page opened it. Same "small standalone zustand store" precedent as
 * capture-session-store.ts.
 */
export const useLightboxStore = create<LightboxState>((set, get) => ({
  photos: [],
  index: 0,
  open: false,
  openLightbox: (photos, index = 0) => {
    if (photos.length === 0) return;
    set({ photos, index: Math.min(Math.max(index, 0), photos.length - 1), open: true });
  },
  close: () => set({ open: false }),
  next: () => {
    const { photos, index } = get();
    if (photos.length === 0) return;
    set({ index: (index + 1) % photos.length });
  },
  prev: () => {
    const { photos, index } = get();
    if (photos.length === 0) return;
    set({ index: (index - 1 + photos.length) % photos.length });
  },
  setIndex: (index) => set({ index }),
}));
