import { buildBreadcrumb, breadcrumbLabel } from "./selectors";
import type { Container, Item, Location, Tag } from "./types";

// Weighted, token-based ranking across items/containers/locations, in the
// spirit of PRD §11 (typo-tolerant-ish, spans names/categories/tags/
// breadcrumbs, ranked). Adapted from the scoring approach already proven in
// the legacy Apps Script backend's searchInventory().

export interface SearchResult {
  item: Item;
  score: number;
  breadcrumbLabel: string;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
}

export function searchItems(
  query: string,
  items: Item[],
  containers: Container[],
  locations: Location[],
  tags: Tag[]
): SearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryTokens = tokenize(q);

  const results = items
    .filter((it) => it.status === "active")
    .map((it) => {
      const breadcrumb = buildBreadcrumb(it.locationId, it.containerId, locations, containers);
      const breadcrumbText = breadcrumbLabel(breadcrumb).toLowerCase();
      const displayCode = (containers.find((c) => c.id === it.containerId)?.displayCode ?? "").toLowerCase();
      const tagNames = it.tagIds
        .map((tid) => tags.find((t) => t.id === tid)?.name ?? "")
        .join(" ")
        .toLowerCase();

      const name = it.name.toLowerCase();
      const original = (it.originalDetectedName ?? "").toLowerCase();
      const category = it.category.toLowerCase();
      const notes = it.notes.toLowerCase();

      let score = 0;
      if (name === q) score += 100;
      if (name.includes(q)) score += 60;
      if (original.includes(q)) score += 45;
      if (category.includes(q)) score += 25;
      if (breadcrumbText.includes(q)) score += 30;
      if (displayCode && displayCode === q) score += 80;
      else if (displayCode.includes(q)) score += 40;
      if (tagNames.includes(q)) score += 30;
      if (notes.includes(q)) score += 10;

      const searchable = [name, original, category, notes, tagNames, breadcrumbText, displayCode].join(" ");
      for (const token of queryTokens) {
        if (name.includes(token)) score += 12;
        if (breadcrumbText.includes(token)) score += 8;
        if (searchable.includes(token)) score += 3;
      }

      return { item: it, score, breadcrumbLabel: breadcrumbLabel(breadcrumb) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));

  return results;
}
