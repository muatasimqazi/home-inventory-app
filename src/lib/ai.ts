// VisionProvider abstraction per PRD §24: detectItems(photo) -> DetectedItem[].
// MockVisionProvider stands in for a real model until credentials exist —
// swap the export at the bottom for a real implementation later without
// touching any call site.

/** A tight region within its source photo, normalized 0-1 (fraction of width/height) so it's independent of the photo's actual pixel size. */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedItem {
  suggestedName: string;
  category: string;
  suggestedTags: string[];
  confidence: number; // 0-1
  photoEmoji: string;
  needsReview: boolean;
  reviewReason?: string;
  /** 0-based index into the photos array this item was found in — which of possibly several session photos to crop its cover from. */
  photoIndex: number;
  /** Where in that photo this item is, so its cover can be cropped to just it instead of the whole (possibly multi-item) photo. Null when the model couldn't localize it confidently — falls back to the full photo. */
  boundingBox: BoundingBox | null;
}

export interface VisionProvider {
  detectItems(photos: string[]): Promise<DetectedItem[]>;
}

/** Thrown by a VisionProvider on failure — `retryable` tells the UI whether "Try again" is a reasonable next step (true for anything transient, e.g. Gemini overload) vs. something that won't fix itself. */
export class VisionDetectionError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "VisionDetectionError";
    this.retryable = retryable;
  }
}

export const REVIEW_THRESHOLD = 0.75;

// A few of these get a canned bounding box (roughly the item sitting
// somewhere other than dead-center) so the mock exercises the same
// crop-to-item path real detection does; the rest leave it null to
// exercise the whole-photo fallback too.
const CANNED_POOL: Omit<DetectedItem, "needsReview" | "reviewReason" | "photoIndex">[] = [
  { suggestedName: "Phillips Screwdriver", category: "Tool", suggestedTags: ["hand-tools"], confidence: 0.94, photoEmoji: "🪛", boundingBox: { x: 0.1, y: 0.2, width: 0.25, height: 0.5 } },
  { suggestedName: "Flashlight", category: "Tool", suggestedTags: ["power-tools"], confidence: 0.91, photoEmoji: "🔦", boundingBox: { x: 0.5, y: 0.15, width: 0.3, height: 0.35 } },
  { suggestedName: "Duct Tape", category: "Hardware", suggestedTags: [], confidence: 0.88, photoEmoji: "🎞️", boundingBox: { x: 0.3, y: 0.4, width: 0.2, height: 0.2 } },
  { suggestedName: "Winter Gloves", category: "Clothing", suggestedTags: ["seasonal"], confidence: 0.9, photoEmoji: "🧤", boundingBox: null },
  { suggestedName: "Picture Frame", category: "Decor", suggestedTags: [], confidence: 0.85, photoEmoji: "🖼️", boundingBox: { x: 0.15, y: 0.1, width: 0.4, height: 0.6 } },
  { suggestedName: "Yoga Mat", category: "Sporting Goods", suggestedTags: [], confidence: 0.93, photoEmoji: "🧘", boundingBox: null },
  { suggestedName: "Paint Can", category: "Hardware", suggestedTags: [], confidence: 0.82, photoEmoji: "🎨", boundingBox: { x: 0.4, y: 0.35, width: 0.22, height: 0.3 } },
  { suggestedName: "Garden Trowel", category: "Outdoor", suggestedTags: [], confidence: 0.89, photoEmoji: "🌱", boundingBox: { x: 0.2, y: 0.5, width: 0.5, height: 0.15 } },
  { suggestedName: "Phone Charger", category: "Electronics", suggestedTags: [], confidence: 0.9, photoEmoji: "🔌", boundingBox: { x: 0.6, y: 0.6, width: 0.15, height: 0.2 } },
  { suggestedName: "unidentified small appliance", category: "Electronics", suggestedTags: [], confidence: 0.52, photoEmoji: "📻", boundingBox: null },
  { suggestedName: "spiral notebook (color unclear)", category: "Miscellaneous", suggestedTags: [], confidence: 0.61, photoEmoji: "📓", boundingBox: { x: 0.25, y: 0.25, width: 0.35, height: 0.4 } },
  { suggestedName: "Candle", category: "Decor", suggestedTags: [], confidence: 0.87, photoEmoji: "🕯️", boundingBox: { x: 0.45, y: 0.3, width: 0.15, height: 0.35 } },
  { suggestedName: "Water Bottle", category: "Kitchen", suggestedTags: [], confidence: 0.92, photoEmoji: "🍶", boundingBox: { x: 0.35, y: 0.1, width: 0.15, height: 0.55 } },
];

/** Shared by MockVisionProvider and the /api/v1/vision/detect route, so both apply the same review threshold. */
export function withReview(candidate: Omit<DetectedItem, "needsReview" | "reviewReason">): DetectedItem {
  const needsReview = candidate.confidence < REVIEW_THRESHOLD;
  return {
    ...candidate,
    needsReview,
    reviewReason: needsReview ? `Confidence ${candidate.confidence.toFixed(2)} is below ${REVIEW_THRESHOLD}.` : undefined,
  };
}

export class MockVisionProvider implements VisionProvider {
  async detectItems(photos: string[]): Promise<DetectedItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // One item per photo when there are several (each gets its own
    // photoIndex); a single photo may hold a small batch, all photoIndex 0.
    const perPhotoCount = photos.length === 1 ? weightedSingleOrFew() : 1;
    const totalCount = photos.length === 1 ? perPhotoCount : photos.length;

    const shuffled = [...CANNED_POOL].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(totalCount, CANNED_POOL.length));
    return picked.map((candidate, i) => withReview({ ...candidate, photoIndex: photos.length === 1 ? 0 : i }));
  }
}

/** Mostly single-item captures (the primary flow), occasionally a small batch. */
function weightedSingleOrFew(): number {
  const roll = Math.random();
  if (roll < 0.55) return 1;
  if (roll < 0.8) return 2;
  if (roll < 0.93) return 3;
  return 4;
}

/**
 * Real, active provider — client-safe by construction: it only ever calls
 * the /api/v1/vision/detect route over fetch, never touches a model
 * provider directly (that lives server-side in lib/vision/detect.ts, which
 * routes both the primary and fallback models through Vercel AI Gateway).
 */
export class HttpVisionProvider implements VisionProvider {
  async detectItems(photos: string[]): Promise<DetectedItem[]> {
    let res: Response;
    try {
      res = await fetch("/api/v1/vision/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
    } catch {
      // fetch() itself only throws for a real network failure (offline,
      // DNS, etc.) — not for the server responding with an error status,
      // which is handled below.
      throw new VisionDetectionError("Couldn't reach the server. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new VisionDetectionError(body?.error ?? `Vision detection failed (${res.status}).`, body?.retryable ?? true);
    }
    const { items } = (await res.json()) as { items: DetectedItem[] };
    return items;
  }
}

// Real detection is live, routed through Vercel AI Gateway (see
// lib/vision/detect.ts). Every call site in the app depends only on the
// VisionProvider interface, so this was the only line that needed to change
// when the underlying implementation moved off a direct Google API key.
export const visionProvider: VisionProvider = new HttpVisionProvider();
