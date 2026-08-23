import type { LabelPaperPreset, LabelToggle } from "./types";

export interface LabelPresetConfig {
  name: string;
  columns: number;
  widthMm: number;
  heightMm: number;
}

// Generic sheet layouts — not tied to a specific vendor SKU. Sizes are
// approximate starting points for print alignment, adjustable via offsetX/Y.
export const LABEL_PRESETS: Record<LabelPaperPreset, LabelPresetConfig> = {
  "small-3up": { name: "Small labels — 3 per row", columns: 3, widthMm: 63.5, heightMm: 29 },
  "small-4up": { name: "Small labels — 4 per row", columns: 4, widthMm: 48, heightMm: 25 },
  "medium-2up": { name: "Medium labels — 2 per row", columns: 2, widthMm: 95, heightMm: 38 },
  "large-1up": { name: "Large labels — 1 per row", columns: 1, widthMm: 190, heightMm: 50 },
};

export const LABEL_TOGGLE_NAMES: Record<LabelToggle, string> = {
  qr: "QR only",
  "qr-code": "QR + Container ID",
  "qr-code-name": "QR + Container ID + Name",
};
