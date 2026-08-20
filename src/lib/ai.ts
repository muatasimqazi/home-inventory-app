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
  /** How many identical/near-identical copies the model reported seeing together — 3 identical pens is one DetectedItem with quantity 3, not three separate ones. */
  quantity: number;
  /** Where in that photo this item is, so its cover can be cropped to just it instead of the whole (possibly multi-item) photo — loosely covering the whole group when quantity > 1. Null when the model couldn't localize it confidently — falls back to the full photo. */
  boundingBox: BoundingBox | null;
}

// ---------------------------------------------------------------------------
// Receipt scanning (docs/Receipt Scanning Addendum.md §4) — extends
// VisionProvider with a second method, same provider, same reliability
// engineering (AI Gateway routing, bounded timeouts, fallback model).
//
// The extraction prompt is adopted verbatim from an already-proven iOS
// Shortcuts flow doing this exact task today — these interfaces
// deliberately keep the model's own snake_case field names (raw_item,
// standard_name, ...) rather than renaming to camelCase, per the
// Addendum: "The LLM's raw output stays exactly this snake_case shape...
// The TypeScript layer maps it on the way in" — the mapping into the
// app's normal camelCase domain shapes (ScannedTransactionDraft,
// ScannedReceiptLineItem) happens one layer up, in
// receipt-scan-session-store.ts, not here.
// ---------------------------------------------------------------------------

export interface ReceiptLineItemExtraction {
  raw_item: string;
  standard_name: string;
  brand: string;
  category_guess: string;
  subcategory_guess: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  confidence: number; // 0-1 — same REVIEW_THRESHOLD applies, now per item too
}

export interface ReceiptExtraction {
  store: string;
  date: string; // ISO date, extracted
  subtotal: number; // dollars, as given by the model — converted to *_cents at the DB boundary
  tax: number;
  total: number;
  /** Last 4 digits printed on the receipt, empty string if not present/legible — added beyond the original proven prompt (Addendum §6), drives account auto-matching. */
  card_last_four: string;
  items: ReceiptLineItemExtraction[];
}

// ---------------------------------------------------------------------------
// Statement import (bank/card statement upload -> recurring-bill detection).
// Separate model task from receipt extraction — a statement is text-dense
// and often several pages, not a single itemized purchase — but the same
// "extract structured transactions from a document photo/file" shape, so it
// gets the same reliability engineering (AI Gateway, primary+fallback,
// bounded timeout) rather than a bespoke pipeline. Detection of *which*
// extracted transactions are actually recurring happens entirely
// client-side afterward (lib/recurring-detection.ts) — this layer's only
// job is turning the statement into a flat transaction list.
// ---------------------------------------------------------------------------

export interface StatementTransactionExtraction {
  date: string; // ISO date, extracted
  merchant: string; // exactly as printed on the statement
  /** Signed, same convention as Transaction.amount: negative = charge/debit, positive = payment/credit/refund. */
  amount: number;
}

// ---------------------------------------------------------------------------
// Appliance label OCR (Household Ledger PRD §27) — extends VisionProvider
// with a third method, same shape as extractReceipts/extractStatement
// above: one appliance nameplate photo (or a couple, if one shot doesn't
// capture the whole label) in, one structured reading out. See
// lib/vision/detect.ts's detectApplianceLabel for the real implementation.
// ---------------------------------------------------------------------------

export interface ApplianceLabelDetection {
  suggestedName: string;
  photoEmoji: string;
  manufacturer: string;
  modelNumber: string;
  serialNumber: string;
  /** Freeform — a year, a month/year, or a full date, whatever precision the label supports. Empty string if not legible. */
  manufactureDate: string;
  confidence: number; // 0-1
}

export interface VisionProvider {
  detectItems(photos: string[]): Promise<DetectedItem[]>;
  /** One scan batch (a statement, a stack of receipts) can contain multiple receipts — array, not a single result. */
  extractReceipts(photos: string[]): Promise<ReceiptExtraction[]>;
  /** One PDF statement -> every transaction line found across all its pages. */
  extractStatement(fileDataUrl: string): Promise<StatementTransactionExtraction[]>;
  /** Reads a manufacturer's nameplate/rating label off an appliance photo. */
  detectApplianceLabel(photos: string[]): Promise<ApplianceLabelDetection>;
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
// exercise the whole-photo fallback too. A few also get a quantity above 1
// to exercise the "one entry, not one per copy" grouping path.
const CANNED_POOL: Omit<DetectedItem, "needsReview" | "reviewReason" | "photoIndex">[] = [
  { suggestedName: "Phillips Screwdriver", category: "Tool", suggestedTags: ["hand-tools"], confidence: 0.94, photoEmoji: "🪛", quantity: 1, boundingBox: { x: 0.1, y: 0.2, width: 0.25, height: 0.5 } },
  { suggestedName: "Flashlight", category: "Tool", suggestedTags: ["power-tools"], confidence: 0.91, photoEmoji: "🔦", quantity: 1, boundingBox: { x: 0.5, y: 0.15, width: 0.3, height: 0.35 } },
  { suggestedName: "Duct Tape", category: "Hardware", suggestedTags: [], confidence: 0.88, photoEmoji: "🎞️", quantity: 2, boundingBox: { x: 0.3, y: 0.4, width: 0.2, height: 0.2 } },
  { suggestedName: "Winter Gloves", category: "Clothing", suggestedTags: ["seasonal"], confidence: 0.9, photoEmoji: "🧤", quantity: 1, boundingBox: null },
  { suggestedName: "Picture Frame", category: "Decor", suggestedTags: [], confidence: 0.85, photoEmoji: "🖼️", quantity: 1, boundingBox: { x: 0.15, y: 0.1, width: 0.4, height: 0.6 } },
  { suggestedName: "Yoga Mat", category: "Sporting Goods", suggestedTags: [], confidence: 0.93, photoEmoji: "🧘", quantity: 1, boundingBox: null },
  { suggestedName: "Paint Can", category: "Hardware", suggestedTags: [], confidence: 0.82, photoEmoji: "🎨", quantity: 1, boundingBox: { x: 0.4, y: 0.35, width: 0.22, height: 0.3 } },
  { suggestedName: "Garden Trowel", category: "Outdoor", suggestedTags: [], confidence: 0.89, photoEmoji: "🌱", quantity: 1, boundingBox: { x: 0.2, y: 0.5, width: 0.5, height: 0.15 } },
  { suggestedName: "Phone Charger", category: "Electronics", suggestedTags: [], confidence: 0.9, photoEmoji: "🔌", quantity: 1, boundingBox: { x: 0.6, y: 0.6, width: 0.15, height: 0.2 } },
  { suggestedName: "unidentified small appliance", category: "Electronics", suggestedTags: [], confidence: 0.52, photoEmoji: "📻", quantity: 1, boundingBox: null },
  { suggestedName: "spiral notebook (color unclear)", category: "Miscellaneous", suggestedTags: [], confidence: 0.61, photoEmoji: "📓", quantity: 1, boundingBox: { x: 0.25, y: 0.25, width: 0.35, height: 0.4 } },
  { suggestedName: "Candle", category: "Decor", suggestedTags: [], confidence: 0.87, photoEmoji: "🕯️", quantity: 3, boundingBox: { x: 0.45, y: 0.3, width: 0.15, height: 0.35 } },
  { suggestedName: "Water Bottle", category: "Kitchen", suggestedTags: [], confidence: 0.92, photoEmoji: "🍶", quantity: 1, boundingBox: { x: 0.35, y: 0.1, width: 0.15, height: 0.55 } },
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

// One canned receipt per source photo — a single photo is "I scanned one
// receipt," several photos is "I scanned a stack/statement" (Addendum
// §2's two modes), same one-item-or-one-per-photo shape MockVisionProvider
// already uses for detectItems above.
const CANNED_RECEIPTS: ReceiptExtraction[] = [
  {
    store: "Whole Foods Market",
    date: new Date().toISOString().slice(0, 10),
    subtotal: 80.0,
    tax: 6.4,
    total: 86.4,
    card_last_four: "4821",
    items: [
      { raw_item: "ORG BANANA", standard_name: "Organic Bananas", brand: "", category_guess: "Groceries", subcategory_guess: "Produce", quantity: 3, unit_price: 0.79, line_total: 2.37, confidence: 0.88 },
      { raw_item: "WHL MILK GAL", standard_name: "Whole Milk (1 gal)", brand: "365", category_guess: "Groceries", subcategory_guess: "Dairy", quantity: 1, unit_price: 4.49, line_total: 4.49, confidence: 0.93 },
      { raw_item: "SRDN BREAD", standard_name: "Sourdough Bread", brand: "", category_guess: "Groceries", subcategory_guess: "Bakery", quantity: 1, unit_price: 5.99, line_total: 5.99, confidence: 0.72 },
    ],
  },
  {
    store: "Costco Wholesale",
    date: new Date().toISOString().slice(0, 10),
    subtotal: 212.47,
    tax: 0,
    total: 212.47,
    card_last_four: "1029",
    items: [
      { raw_item: "KS PAPER TWL", standard_name: "Kirkland Signature Paper Towels", brand: "Kirkland Signature", category_guess: "Household", subcategory_guess: "Paper Goods", quantity: 1, unit_price: 24.99, line_total: 24.99, confidence: 0.85 },
      { raw_item: "ROTIS CHKN", standard_name: "Rotisserie Chicken", brand: "", category_guess: "Groceries", subcategory_guess: "Prepared Foods", quantity: 2, unit_price: 4.99, line_total: 9.98, confidence: 0.9 },
      { raw_item: "TIRE SET", standard_name: "Tire Set (4)", brand: "", category_guess: "Auto", subcategory_guess: "", quantity: 1, unit_price: 177.5, line_total: 177.5, confidence: 0.58 },
    ],
  },
  {
    store: "Shell",
    date: new Date().toISOString().slice(0, 10),
    subtotal: 42.15,
    tax: 0,
    total: 42.15,
    card_last_four: "",
    items: [
      { raw_item: "UNL GAS", standard_name: "Unleaded Gasoline", brand: "", category_guess: "Auto", subcategory_guess: "Fuel", quantity: 1, unit_price: 42.15, line_total: 42.15, confidence: 0.81 },
    ],
  },
];

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

  async extractReceipts(photos: string[]): Promise<ReceiptExtraction[]> {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    const shuffled = [...CANNED_RECEIPTS].sort(() => Math.random() - 0.5);
    const count = Math.max(1, Math.min(photos.length, CANNED_RECEIPTS.length));
    return shuffled.slice(0, count);
  }

  async extractStatement(): Promise<StatementTransactionExtraction[]> {
    await new Promise((resolve) => setTimeout(resolve, 1800));
    // Deliberately includes two clear recurring patterns (Netflix monthly,
    // gym biweekly-ish) alongside one-off purchases — exercises the
    // detection heuristic end-to-end without a live model call.
    return CANNED_STATEMENT_TRANSACTIONS;
  }

  async detectApplianceLabel(): Promise<ApplianceLabelDetection> {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const shuffled = [...CANNED_APPLIANCE_LABELS].sort(() => Math.random() - 0.5);
    return shuffled[0];
  }
}

const CANNED_APPLIANCE_LABELS: ApplianceLabelDetection[] = [
  { suggestedName: "Samsung Refrigerator", photoEmoji: "🧊", manufacturer: "Samsung", modelNumber: "RF28R7351SG", serialNumber: "0A1B2C3D4E5F", manufactureDate: "2023-04", confidence: 0.91 },
  { suggestedName: "LG Front-Load Washer", photoEmoji: "🧺", manufacturer: "LG", modelNumber: "WM3400CW", serialNumber: "205KWXY01234", manufactureDate: "2022", confidence: 0.88 },
  { suggestedName: "Whirlpool Dishwasher", photoEmoji: "🍽️", manufacturer: "Whirlpool", modelNumber: "WDF520PADM", serialNumber: "F41234567", manufactureDate: "", confidence: 0.62 },
  { suggestedName: "unidentified appliance", photoEmoji: "🔌", manufacturer: "", modelNumber: "", serialNumber: "", manufactureDate: "", confidence: 0.35 },
];

const CANNED_STATEMENT_TRANSACTIONS: StatementTransactionExtraction[] = [
  { date: "2026-05-14", merchant: "NETFLIX.COM", amount: -15.49 },
  { date: "2026-05-18", merchant: "Trader Joe's", amount: -62.14 },
  { date: "2026-06-01", merchant: "Shell Gas Station", amount: -41.02 },
  { date: "2026-06-14", merchant: "NETFLIX.COM", amount: -15.49 },
  { date: "2026-06-20", merchant: "Amazon.com", amount: -28.37 },
  { date: "2026-06-15", merchant: "24 Hour Fitness", amount: -34.99 },
  { date: "2026-07-14", merchant: "NETFLIX.COM", amount: -15.49 },
  { date: "2026-07-16", merchant: "24 Hour Fitness", amount: -34.99 },
  { date: "2026-08-01", merchant: "Whole Foods Market", amount: -78.22 },
  { date: "2026-08-14", merchant: "NETFLIX.COM", amount: -16.49 },
  { date: "2026-08-15", merchant: "24 Hour Fitness", amount: -34.99 },
];

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

  async extractReceipts(photos: string[]): Promise<ReceiptExtraction[]> {
    let res: Response;
    try {
      res = await fetch("/api/v1/vision/extract-receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
    } catch {
      throw new VisionDetectionError("Couldn't reach the server. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new VisionDetectionError(body?.error ?? `Receipt extraction failed (${res.status}).`, body?.retryable ?? true);
    }
    const { receipts } = (await res.json()) as { receipts: ReceiptExtraction[] };
    return receipts;
  }

  async extractStatement(fileDataUrl: string): Promise<StatementTransactionExtraction[]> {
    let res: Response;
    try {
      res = await fetch("/api/v1/vision/extract-statement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: fileDataUrl }),
      });
    } catch {
      throw new VisionDetectionError("Couldn't reach the server. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new VisionDetectionError(body?.error ?? `Statement extraction failed (${res.status}).`, body?.retryable ?? true);
    }
    const { transactions } = (await res.json()) as { transactions: StatementTransactionExtraction[] };
    return transactions;
  }

  async detectApplianceLabel(photos: string[]): Promise<ApplianceLabelDetection> {
    let res: Response;
    try {
      res = await fetch("/api/v1/vision/detect-appliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos }),
      });
    } catch {
      throw new VisionDetectionError("Couldn't reach the server. Check your connection and try again.", true);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new VisionDetectionError(body?.error ?? `Appliance label reading failed (${res.status}).`, body?.retryable ?? true);
    }
    return (await res.json()) as ApplianceLabelDetection;
  }
}

// Real detection is live, routed through Vercel AI Gateway (see
// lib/vision/detect.ts). Every call site in the app depends only on the
// VisionProvider interface, so this was the only line that needed to change
// when the underlying implementation moved off a direct Google API key.
export const visionProvider: VisionProvider = new HttpVisionProvider();
