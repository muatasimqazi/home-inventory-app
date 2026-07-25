import type { Container, Item, Location, Tag } from "./types";

// Minimal CSV parser — handles quoted fields and commas within quotes,
// which covers the realistic shape of an exported Sheets CSV without
// pulling in a dependency for a one-screen desktop import flow.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

const INVENTORY_CSV_HEADERS = [
  "Name",
  "Category",
  "Quantity",
  "Location",
  "Container",
  "Bin ID",
  "Tags",
  "Notes",
  "Status",
  "Created At",
] as const;

/** Full active+archived+trashed inventory as CSV — the "Inventory CSV export" in Settings > Data & Export. */
export function itemsToCsv(items: Item[], containers: Container[], locations: Location[], tags: Tag[]): string {
  const lines = [INVENTORY_CSV_HEADERS.join(",")];
  for (const item of items) {
    const location = locations.find((l) => l.id === item.locationId);
    const container = containers.find((c) => c.id === item.containerId);
    const tagNames = item.tagIds.map((id) => tags.find((t) => t.id === id)?.name).filter(Boolean).join("; ");
    const row = [
      item.name,
      item.category,
      String(item.quantity),
      location?.name ?? "",
      container?.name ?? "",
      container?.displayCode ?? "",
      tagNames,
      item.notes,
      item.status,
      item.createdAt,
    ];
    lines.push(row.map(csvField).join(","));
  }
  return lines.join("\r\n");
}
