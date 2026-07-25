import type { Container, Item, Location, Tag } from "./types";

export interface BreadcrumbSegment {
  id: string;
  name: string;
  href: string;
}

/** Location -> Container -> ... -> Container path for an item or container. */
export function buildBreadcrumb(
  locationId: string | null,
  containerId: string | null,
  locations: Location[],
  containers: Container[]
): BreadcrumbSegment[] {
  const segments: BreadcrumbSegment[] = [];
  const location = locations.find((l) => l.id === locationId);
  if (location) segments.push({ id: location.id, name: location.name, href: `/locations/${location.id}` });

  const path: Container[] = [];
  let current = containers.find((c) => c.id === containerId);
  while (current) {
    path.unshift(current);
    current = current.parentContainerId ? containers.find((c) => c.id === current!.parentContainerId) : undefined;
  }
  for (const c of path) segments.push({ id: c.id, name: c.name, href: `/containers/${c.id}` });

  return segments;
}

export function breadcrumbLabel(segments: BreadcrumbSegment[]): string {
  return segments.map((s) => s.name).join(" → ") || "Unfiled";
}

export function activeLocations(locations: Location[]): Location[] {
  return locations.filter((l) => l.status === "active");
}

export function activeContainers(containers: Container[]): Container[] {
  return containers.filter((c) => c.status === "active");
}

export function directChildContainers(containers: Container[], parentId: string | null, locationId?: string): Container[] {
  return containers.filter(
    (c) => c.status === "active" && c.parentContainerId === parentId && (locationId ? c.locationId === locationId : true)
  );
}

export function itemsIn(items: Item[], locationId: string | null, containerId: string | null): Item[] {
  return items.filter((it) => it.status === "active" && it.locationId === locationId && it.containerId === containerId);
}

export function activeItemCountForLocation(items: Item[], locationId: string): number {
  return items.filter((it) => it.status === "active" && it.locationId === locationId).length;
}

export function activeItemCountForContainer(items: Item[], containers: Container[], containerId: string): number {
  const descendants = new Set([containerId, ...collectDescendantIds(containers, containerId)]);
  return items.filter((it) => it.status === "active" && it.containerId && descendants.has(it.containerId)).length;
}

function collectDescendantIds(containers: Container[], rootId: string): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of containers.filter((c) => c.parentContainerId === current)) {
      out.push(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

export interface HouseholdSummary {
  totalActiveItems: number;
  needsReviewCount: number;
  trashExpiringSoonCount: number;
  itemCountByLocation: Record<string, number>;
}

export function computeHouseholdSummary(items: Item[], locations: Location[]): HouseholdSummary {
  const now = Date.now();
  const fortyEightHours = 48 * 60 * 60 * 1000;
  const itemCountByLocation: Record<string, number> = {};
  for (const loc of locations) {
    itemCountByLocation[loc.id] = activeItemCountForLocation(items, loc.id);
  }
  return {
    totalActiveItems: items.filter((it) => it.status === "active").length,
    needsReviewCount: items.filter((it) => it.status === "active" && it.needsReview).length,
    trashExpiringSoonCount: items.filter(
      (it) => it.status === "trashed" && it.permanentlyDeleteAfter && new Date(it.permanentlyDeleteAfter).getTime() - now <= fortyEightHours
    ).length,
    itemCountByLocation,
  };
}

export interface TagWithCount {
  tag: Tag;
  count: number;
}

export function tagItemCounts(items: Item[], tags: Tag[]): TagWithCount[] {
  return tags
    .map((tag) => ({
      tag,
      count: items.filter((it) => it.status === "active" && it.tagIds.includes(tag.id)).length,
    }))
    .sort((a, b) => b.count - a.count || a.tag.name.localeCompare(b.tag.name));
}

export function itemsForTag(items: Item[], tagId: string): Item[] {
  return items.filter((it) => it.status === "active" && it.tagIds.includes(tagId));
}

export function daysUntil(dateIso: string): number {
  const diff = new Date(dateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}
