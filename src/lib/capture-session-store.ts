"use client";

import { create } from "zustand";
import { visionProvider, type DetectedItem } from "./ai";
import { id } from "./id";

export interface DetectionRow extends DetectedItem {
  rowId: string;
  excluded: boolean;
  name: string; // editable, pre-filled from suggestedName
  category: string; // editable
  quantity: number; // editable, 0-9999
}

interface CaptureSessionState {
  photos: string[];
  destination: { locationId: string | null; containerId: string | null } | null;
  detections: DetectionRow[] | null;
  detecting: boolean;

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

  setDestination: (dest) => set({ destination: dest }),

  addPhoto: (dataUrl) => set((s) => ({ photos: [...s.photos, dataUrl] })),

  removePhoto: (index) => set((s) => ({ photos: s.photos.filter((_, i) => i !== index) })),

  runDetection: async () => {
    set({ detecting: true });
    const detected = await visionProvider.detectItems(get().photos);
    const rows: DetectionRow[] = detected.map((d) => ({
      ...d,
      rowId: id("det"),
      excluded: false,
      name: d.suggestedName,
      category: d.category,
      quantity: 1,
    }));
    set({ detections: rows, detecting: false });
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
          excluded: false,
          name: "",
          quantity: 1,
        },
      ],
    })),

  reset: () => set({ photos: [], destination: null, detections: null, detecting: false }),
}));
