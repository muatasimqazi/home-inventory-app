"use client";

import { useInventoryStore } from "@/lib/store";

/**
 * "Belongs to" cell inside the item-detail `<dl>` grid (Household Ledger
 * Implementation Plan §2 — Phase 0 componentization). Reads `people` /
 * `owner_person_id` (PRD §8/§9) — Workstream 2's migration off the legacy
 * `ownerUserId`/`members` shape this file originally shipped with.
 *
 * "Household" (not "Shared") for a null owner, matching PRD §9's example
 * ("Television — Belongs to: Household") — kept consistent with the same
 * wording in the add/edit item ownership pickers.
 */
export function ItemOwnershipSection({ itemId }: { itemId: string }) {
  const items = useInventoryStore((s) => s.items);
  const people = useInventoryStore((s) => s.people);
  const item = items.find((it) => it.id === itemId);
  if (!item) return null;

  const value = item.ownerPersonId
    ? (people.find((p) => p.id === item.ownerPersonId)?.displayName ?? "Unknown")
    : "Household";

  return (
    <div>
      <dt className="text-caption text-muted-foreground">Belongs to</dt>
      <dd className="mt-1.5 text-body text-ink">{value}</dd>
    </div>
  );
}
