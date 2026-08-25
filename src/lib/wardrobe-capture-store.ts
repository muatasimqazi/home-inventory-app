"use client";

import { create } from "zustand";
import { visionProvider, VisionDetectionError, type WardrobeItemDetection } from "./ai";

// A dedicated, deliberately tiny session store for the wardrobe capture
// flow (docs/Wardrobe Inventory.md) — src/app/capture/wardrobe/ and
// src/app/capture/wardrobe/review/. Mirrors appliance-capture-store.ts's
// exact shape (own store per capture mode, not folded into the general
// multi-photo capture-session-store.ts — same reasoning that file's own
// header comment gives: a single-item field set doesn't fit that store's
// "N photos -> M detected items" shape without real surgery).
export interface WardrobeReviewFields {
  name: string;
  category: string;
  color: string;
  /** Explicitly accepted a low-confidence AI reading as-is — same "Confirm" escape hatch appliance-capture-store.ts's ApplianceReviewFields uses. */
  confirmed: boolean;
}

export interface WardrobeDetectError {
  message: string;
  retryable: boolean;
}

interface WardrobeCaptureState {
  photo: string | null;
  destination: { locationId: string | null; containerId: string | null } | null;
  detection: WardrobeItemDetection | null;
  photoEmoji: string;
  fields: WardrobeReviewFields | null;
  detecting: boolean;
  detectError: WardrobeDetectError | null;

  setPhoto: (dataUrl: string) => void;
  setDestination: (dest: { locationId: string | null; containerId: string | null }) => void;
  runDetection: () => Promise<void>;
  updateFields: (patch: Partial<WardrobeReviewFields>) => void;
  reset: () => void;
}

const DEFAULT_CATEGORY = "Clothing";

export const useWardrobeCapture = create<WardrobeCaptureState>()((set, get) => ({
  photo: null,
  destination: null,
  detection: null,
  photoEmoji: "👕",
  fields: null,
  detecting: false,
  detectError: null,

  setPhoto: (dataUrl) => set({ photo: dataUrl }),
  setDestination: (dest) => set({ destination: dest }),

  runDetection: async () => {
    const photo = get().photo;
    if (!photo) return;
    set({ detecting: true, detectError: null });
    try {
      const detection = await visionProvider.detectWardrobeItem([photo]);
      set({
        detecting: false,
        detection,
        photoEmoji: detection.photoEmoji || "👕",
        fields: {
          name: detection.suggestedName,
          category: detection.category || DEFAULT_CATEGORY,
          color: detection.color,
          confirmed: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't catalog this item.";
      const retryable = error instanceof VisionDetectionError ? error.retryable : true;
      set({ detecting: false, detectError: { message, retryable } });
    }
  },

  updateFields: (patch) => set((s) => ({ fields: s.fields ? { ...s.fields, ...patch } : s.fields })),

  reset: () => set({ photo: null, destination: null, detection: null, photoEmoji: "👕", fields: null, detecting: false, detectError: null }),
}));
