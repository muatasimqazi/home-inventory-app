import type {
  Attachment,
  Container,
  Favorite,
  Household,
  Item,
  LabelBatch,
  LabelBatchEntry,
  Location,
  Member,
  Tag,
} from "./types";

export interface HouseholdExportSnapshot {
  exportedAt: string;
  household: Household;
  members: Member[];
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  favorites: Favorite[];
  attachments: Attachment[];
  labelBatches: LabelBatch[];
  labelBatchEntries: LabelBatchEntry[];
}

/** Full household data export (mock) — everything in the store, as one JSON document. */
export function buildHouseholdExport(data: Omit<HouseholdExportSnapshot, "exportedAt">): HouseholdExportSnapshot {
  return { exportedAt: new Date().toISOString(), ...data };
}

export interface FileExportResult {
  fileName: string;
  content: string;
  mimeType: string;
  mock?: boolean;
}

/**
 * Label PDF export (mock) — real PDF generation isn't wired up, so this produces a
 * manifest of what the batch would render. Shared by the label printing flow and
 * Settings > Data & Export so both describe the same batch the same way.
 */
export function buildLabelPdfManifest(batch: LabelBatch | null, entries: LabelBatchEntry[]): FileExportResult {
  const manifest = {
    note: "Mock export — real PDF generation isn't wired up yet. This manifest lists what the label batch would render.",
    batch,
    labels: entries.map((e) => ({ tagToken: e.tagToken, displayCode: e.displayCode, containerId: e.containerId })),
  };
  return {
    fileName: `schuaz-label-pdf-manifest-${new Date().toISOString().slice(0, 10)}.json`,
    content: JSON.stringify(manifest, null, 2),
    mimeType: "application/json",
    mock: true,
  };
}

/** Triggers a browser download for in-memory content — no server round-trip needed for mock exports. */
export function downloadFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
