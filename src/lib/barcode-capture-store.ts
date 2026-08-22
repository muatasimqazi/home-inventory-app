"use client";

import { create } from "zustand";
import type { BarcodeLookupResult } from "@/app/api/v1/barcode/lookup/route";

// A dedicated, deliberately tiny session store for the barcode-scan capture
// flow — src/app/capture/barcode/ and src/app/capture/barcode/review/.
// Same shape and reasoning as appliance-capture-store.ts (see that file's
// header comment): a separate self-contained route + store rather than a
// mode flag grafted onto capture-session-store.ts, because "N photos -> M
// detected items" isn't this flow's shape at all — it's "one scanned code
// -> one looked-up product," closer to appliance's "one photo -> one label
// reading" than to the general multi-item flow.
export interface BarcodeReviewFields {
  name: string;
  category: string;
  notes: string;
  /** Explicitly accepted the lookup's suggested name as-is — same "Confirm" escape hatch capture/review/page.tsx and appliance-capture-store.ts use for their own low-confidence/unverified suggestions. A barcode match is an exact database hit, not a probabilistic guess, but it's still a third-party service's word for what's in the user's hand, not the user's own — same "human confirms before saving" posture applies. */
  confirmed: boolean;
}

export interface BarcodeLookupClientError {
  message: string;
  retryable: boolean;
}

export class BarcodeLookupError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "BarcodeLookupError";
    this.retryable = retryable;
  }
}

interface BarcodeCaptureState {
  code: string | null;
  destination: { locationId: string | null; containerId: string | null } | null;
  result: BarcodeLookupResult | null;
  photoEmoji: string;
  fields: BarcodeReviewFields | null;
  looking: boolean;
  lookupError: BarcodeLookupClientError | null;

  setCode: (code: string) => void;
  setDestination: (dest: { locationId: string | null; containerId: string | null }) => void;
  runLookup: () => Promise<void>;
  updateFields: (patch: Partial<BarcodeReviewFields>) => void;
  reset: () => void;
}

const DEFAULT_CATEGORY = "Miscellaneous";
const DEFAULT_EMOJI = "📦";

export const useBarcodeCapture = create<BarcodeCaptureState>()((set, get) => ({
  code: null,
  destination: null,
  result: null,
  photoEmoji: DEFAULT_EMOJI,
  fields: null,
  looking: false,
  lookupError: null,

  setCode: (code) => set({ code }),
  setDestination: (dest) => set({ destination: dest }),

  runLookup: async () => {
    const code = get().code;
    if (!code) return;
    set({ looking: true, lookupError: null });
    try {
      let res: Response;
      try {
        res = await fetch("/api/v1/barcode/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
      } catch {
        throw new BarcodeLookupError("Couldn't reach the server. Check your connection and try again.", true);
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new BarcodeLookupError(body?.error ?? `Barcode lookup failed (${res.status}).`, body?.retryable ?? true);
      }
      const result = (await res.json()) as BarcodeLookupResult;
      set({
        looking: false,
        result,
        photoEmoji: DEFAULT_EMOJI,
        fields: {
          name: result.found ? result.suggestedName : "",
          category: result.category || DEFAULT_CATEGORY,
          notes: result.found
            ? `Barcode: ${result.code}${result.brand ? ` · ${result.brand}` : ""}`
            : `Barcode: ${result.code} (not found in product lookup)`,
          confirmed: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't look up this barcode.";
      const retryable = error instanceof BarcodeLookupError ? error.retryable : true;
      set({ looking: false, lookupError: { message, retryable } });
    }
  },

  updateFields: (patch) => set((s) => ({ fields: s.fields ? { ...s.fields, ...patch } : s.fields })),

  reset: () =>
    set({ code: null, destination: null, result: null, photoEmoji: DEFAULT_EMOJI, fields: null, looking: false, lookupError: null }),
}));
