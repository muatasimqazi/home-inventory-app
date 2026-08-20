"use client";

import { create } from "zustand";
import { visionProvider, VisionDetectionError, type ApplianceLabelDetection } from "./ai";

// A dedicated, deliberately tiny session store for the appliance-label
// capture flow (Household Ledger PRD §27, Implementation Plan Workstream
// 7) — src/app/capture/appliance/ and src/app/capture/appliance/review/.
//
// Kept separate from capture-session-store.ts (the general multi-photo
// item-capture flow) on purpose: that store's shape (a photo array, a list
// of DetectionRow entries, exclude/confirm-per-row state) is built for "N
// photos -> M detected items" and would need real surgery to also carry a
// single label reading with its own field set (manufacturer, model/serial,
// manufacture date) — and the Implementation Plan's hot-file note (§4)
// flags src/app/capture/ as shared territory Workstream 8 builds on next.
// A separate store means this workstream's addition can't destabilize that
// shared flow, and stays easy to find/route around.
export interface ApplianceReviewFields {
  name: string;
  category: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  manufactureDate: string;
  /** Explicitly accepted a low-confidence AI reading as-is (same "Confirm" escape hatch capture/review/page.tsx uses for DetectionRow) — the other way (besides editing the name) to clear the pre-save gate on a low-confidence reading. */
  confirmed: boolean;
}

export interface ApplianceDetectError {
  message: string;
  retryable: boolean;
}

interface ApplianceCaptureState {
  photo: string | null;
  destination: { locationId: string | null; containerId: string | null } | null;
  detection: ApplianceLabelDetection | null;
  photoEmoji: string;
  fields: ApplianceReviewFields | null;
  detecting: boolean;
  detectError: ApplianceDetectError | null;

  setPhoto: (dataUrl: string) => void;
  setDestination: (dest: { locationId: string | null; containerId: string | null }) => void;
  runDetection: () => Promise<void>;
  updateFields: (patch: Partial<ApplianceReviewFields>) => void;
  reset: () => void;
}

const DEFAULT_CATEGORY = "Appliance";

export const useApplianceCapture = create<ApplianceCaptureState>()((set, get) => ({
  photo: null,
  destination: null,
  detection: null,
  photoEmoji: "🔌",
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
      const detection = await visionProvider.detectApplianceLabel([photo]);
      set({
        detecting: false,
        detection,
        photoEmoji: detection.photoEmoji || "🔌",
        fields: {
          name: detection.suggestedName,
          category: DEFAULT_CATEGORY,
          manufacturer: detection.manufacturer,
          modelNumber: detection.modelNumber,
          serialNumber: detection.serialNumber,
          manufactureDate: detection.manufactureDate,
          confirmed: false,
        },
      });
    } catch (error) {
      // Same "don't strand the caller mid-spinner" fix capture-session-
      // store.ts's runDetection applies for the general item-capture flow.
      const message = error instanceof Error ? error.message : "Couldn't read the label.";
      const retryable = error instanceof VisionDetectionError ? error.retryable : true;
      set({ detecting: false, detectError: { message, retryable } });
    }
  },

  updateFields: (patch) => set((s) => ({ fields: s.fields ? { ...s.fields, ...patch } : s.fields })),

  reset: () => set({ photo: null, destination: null, detection: null, photoEmoji: "🔌", fields: null, detecting: false, detectError: null }),
}));
