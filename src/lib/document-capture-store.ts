"use client";

import { create } from "zustand";
import { visionProvider, VisionDetectionError, type DocumentDetection } from "./ai";

// A dedicated, deliberately tiny session store for the document-scan
// capture flow — src/app/capture/document/ and src/app/capture/document/
// review/. Same "kept separate from capture-session-store.ts" reasoning as
// appliance-capture-store.ts: that store's shape (a photo array, a list of
// DetectionRow entries) is built for "N photos -> M detected items," not a
// single document reading with its own field set (issuer, document number,
// expiration date). Mirrors appliance-capture-store.ts's shape exactly,
// field set swapped for the "Document" category's own extra fields
// (lib/category.ts).
export interface DocumentReviewFields {
  name: string;
  category: string;
  issuer: string;
  documentNumber: string;
  expirationDate: string;
  /** Explicitly accepted a low-confidence AI reading as-is — same "Confirm" escape hatch appliance-capture-store.ts's ApplianceReviewFields.confirmed uses. */
  confirmed: boolean;
}

export interface DocumentDetectError {
  message: string;
  retryable: boolean;
}

interface DocumentCaptureState {
  photo: string | null;
  destination: { locationId: string | null; containerId: string | null } | null;
  detection: DocumentDetection | null;
  photoEmoji: string;
  fields: DocumentReviewFields | null;
  detecting: boolean;
  detectError: DocumentDetectError | null;

  setPhoto: (dataUrl: string) => void;
  setDestination: (dest: { locationId: string | null; containerId: string | null }) => void;
  runDetection: () => Promise<void>;
  updateFields: (patch: Partial<DocumentReviewFields>) => void;
  reset: () => void;
}

const DEFAULT_CATEGORY = "Document";

export const useDocumentCapture = create<DocumentCaptureState>()((set, get) => ({
  photo: null,
  destination: null,
  detection: null,
  photoEmoji: "📄",
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
      const detection = await visionProvider.detectDocument([photo]);
      set({
        detecting: false,
        detection,
        photoEmoji: detection.photoEmoji || "📄",
        fields: {
          name: detection.suggestedName,
          category: DEFAULT_CATEGORY,
          issuer: detection.issuer,
          documentNumber: detection.documentNumber,
          expirationDate: detection.expirationDate,
          confirmed: false,
        },
      });
    } catch (error) {
      // Same "don't strand the caller mid-spinner" fix capture-session-
      // store.ts's runDetection applies for the general item-capture flow.
      const message = error instanceof Error ? error.message : "Couldn't read the document.";
      const retryable = error instanceof VisionDetectionError ? error.retryable : true;
      set({ detecting: false, detectError: { message, retryable } });
    }
  },

  updateFields: (patch) => set((s) => ({ fields: s.fields ? { ...s.fields, ...patch } : s.fields })),

  reset: () => set({ photo: null, destination: null, detection: null, photoEmoji: "📄", fields: null, detecting: false, detectError: null }),
}));
