"use client";

import { create } from "zustand";
import { visionProvider, VisionDetectionError, type DetectedItem } from "./ai";
import { id } from "./id";

export interface DetectionRow extends DetectedItem {
  rowId: string;
  excluded: boolean;
  name: string; // editable, pre-filled from suggestedName
  category: string; // editable
  quantity: number; // editable, 0-9999
  /** Explicitly accepted a low-confidence AI suggestion as-is, via the review screen's "Confirm" action — the other way (besides editing the name) to clear needsCorrection's block on Save. */
  confirmed: boolean;
}

export interface DetectError {
  message: string;
  retryable: boolean;
}

interface CaptureSessionState {
  photos: string[];
  destination: { locationId: string | null; containerId: string | null } | null;
  detections: DetectionRow[] | null;
  detecting: boolean;
  /** Set when runDetection() fails (e.g. Gemini overloaded) — null on success or before the first attempt. */
  detectError: DetectError | null;

  setDestination: (dest: { locationId: string | null; containerId: string | null }) => void;
  addPhoto: (dataUrl: string) => void;
  removePhoto: (index: number) => void;
  runDetection: () => Promise<void>;
  updateDetection: (rowId: string, patch: Partial<DetectionRow>) => void;
  toggleExcludeDetection: (rowId: string) => void;
  addManualRow: () => void;
  reset: () => void;
}

export const useCaptureSession = create<CaptureSessionState>()((set, get) => ({
  photos: [],
  destination: null,
  detections: null,
  detecting: false,
  detectError: null,

  setDestination: (dest) => set({ destination: dest }),

  addPhoto: (dataUrl) => set((s) => ({ photos: [...s.photos, dataUrl] })),

  removePhoto: (index) => set((s) => ({ photos: s.photos.filter((_, i) => i !== index) })),

  runDetection: async () => {
    set({ detecting: true, detectError: null });
    try {
      const detected = await visionProvider.detectItems(get().photos);
      const rows: DetectionRow[] = detected.map((d) => ({
        ...d,
        rowId: id("det"),
        excluded: false,
        name: d.suggestedName,
        category: d.category,
        // d.quantity is the model's own count of identical copies grouped
        // into this one entry — previously hardcoded to 1 regardless, which
        // is how "3 identical pens" turned into 3 separate item rows.
        quantity: d.quantity,
        confirmed: false,
      }));
      set({ detections: rows, detecting: false });
    } catch (error) {
      // Previously unhandled — a Gemini failure (e.g. the model being
      // overloaded, a real and fairly common transient state) left
      // `detecting: true` forever, silently stranding the caller on
      // whatever "analyzing" UI it showed with no way out.
      const message = error instanceof Error ? error.message : "Couldn't analyze your photos.";
      const retryable = error instanceof VisionDetectionError ? error.retryable : true;
      set({ detecting: false, detectError: { message, retryable } });
    }
  },

  updateDetection: (rowId, patch) =>
    set((s) => ({ detections: (s.detections ?? []).map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)) })),

  toggleExcludeDetection: (rowId) =>
    set((s) => ({ detections: (s.detections ?? []).map((r) => (r.rowId === rowId ? { ...r, excluded: !r.excluded } : r)) })),

  addManualRow: () =>
    set((s) => ({
      detections: [
        ...(s.detections ?? []),
        {
          rowId: id("det"),
          suggestedName: "",
          category: "Miscellaneous",
          suggestedTags: [],
          confidence: 1,
          photoEmoji: "📦",
          needsReview: false,
          photoIndex: 0,
          boundingBox: null,
          excluded: false,
          name: "",
          quantity: 1,
          confirmed: false,
        },
      ],
    })),

  reset: () => set({ photos: [], destination: null, detections: null, detecting: false, detectError: null }),
}));
