// VisionProvider abstraction per PRD §24: detectItems(photo) -> DetectedItem[].
// MockVisionProvider stands in for Gemini until real credentials exist —
// swap the export at the bottom for a real implementation later without
// touching any call site.

export interface DetectedItem {
  suggestedName: string;
  category: string;
  suggestedTags: string[];
  confidence: number; // 0-1
  photoEmoji: string;
  needsReview: boolean;
  reviewReason?: string;
}

export interface VisionProvider {
  detectItems(photos: string[]): Promise<DetectedItem[]>;
}

const REVIEW_THRESHOLD = 0.75;

const CANNED_POOL: Omit<DetectedItem, "needsReview" | "reviewReason">[] = [
  { suggestedName: "Phillips Screwdriver", category: "Tool", suggestedTags: ["hand-tools"], confidence: 0.94, photoEmoji: "🪛" },
  { suggestedName: "Flashlight", category: "Tool", suggestedTags: ["power-tools"], confidence: 0.91, photoEmoji: "🔦" },
  { suggestedName: "Duct Tape", category: "Hardware", suggestedTags: [], confidence: 0.88, photoEmoji: "🎞️" },
  { suggestedName: "Winter Gloves", category: "Clothing", suggestedTags: ["seasonal"], confidence: 0.9, photoEmoji: "🧤" },
  { suggestedName: "Picture Frame", category: "Decor", suggestedTags: [], confidence: 0.85, photoEmoji: "🖼️" },
  { suggestedName: "Yoga Mat", category: "Sporting Goods", suggestedTags: [], confidence: 0.93, photoEmoji: "🧘" },
  { suggestedName: "Paint Can", category: "Hardware", suggestedTags: [], confidence: 0.82, photoEmoji: "🎨" },
  { suggestedName: "Garden Trowel", category: "Outdoor", suggestedTags: [], confidence: 0.89, photoEmoji: "🌱" },
  { suggestedName: "Phone Charger", category: "Electronics", suggestedTags: [], confidence: 0.9, photoEmoji: "🔌" },
  { suggestedName: "unidentified small appliance", category: "Electronics", suggestedTags: [], confidence: 0.52, photoEmoji: "📻" },
  { suggestedName: "spiral notebook (color unclear)", category: "Miscellaneous", suggestedTags: [], confidence: 0.61, photoEmoji: "📓" },
  { suggestedName: "Candle", category: "Decor", suggestedTags: [], confidence: 0.87, photoEmoji: "🕯️" },
  { suggestedName: "Water Bottle", category: "Kitchen", suggestedTags: [], confidence: 0.92, photoEmoji: "🍶" },
];

function withReview(candidate: Omit<DetectedItem, "needsReview" | "reviewReason">): DetectedItem {
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

    const perPhotoCount = photos.length === 1 ? weightedSingleOrFew() : 1;
    const totalCount = photos.length === 1 ? perPhotoCount : photos.length;

    const shuffled = [...CANNED_POOL].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, Math.min(totalCount, CANNED_POOL.length));
    return picked.map(withReview);
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

export const visionProvider: VisionProvider = new MockVisionProvider();
