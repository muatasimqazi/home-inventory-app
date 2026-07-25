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
