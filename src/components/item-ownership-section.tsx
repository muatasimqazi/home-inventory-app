"use client";

import Link from "next/link";
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
 *
 * A personal item also surfaces its sharing state (0031_item_sharing.sql's
 * is_shared) — "Private" or "Shared" next to the owner's name — so seeing
 * this section at all already implies the viewer can see the item (RLS
 * wouldn't have returned it otherwise), and this makes explicit *why*:
 * either it's theirs, or the owner opted to share it.
 */
export function ItemOwnershipSection({ itemId }: { itemId: string }) {
  const items = useInventoryStore((s) => s.items);
  const people = useInventoryStore((s) => s.people);
  const currentUserId = useInventoryStore((s) => s.currentUserId);
  const item = items.find((it) => it.id === itemId);
  if (!item) return null;

  const owner = item.ownerPersonId ? people.find((p) => p.id === item.ownerPersonId) : undefined;
  const value = item.ownerPersonId ? (owner?.displayName ?? "Unknown") : "Household";
  const isMine = owner?.linkedUserId === currentUserId;

  return (
    <div>
      <dt className="text-caption text-muted-foreground">Belongs to</dt>
      <dd className="mt-1.5 text-body text-ink">
        {item.ownerPersonId ? (
          <Link href={`/people/${item.ownerPersonId}`} className="underline decoration-dotted underline-offset-2">
            {value}
          </Link>
        ) : (
          value
        )}
        {item.ownerPersonId && (
          <span className="ml-1.5 rounded-full bg-surface-muted px-2 py-0.5 text-micro font-medium uppercase tracking-wide text-muted-foreground">
            {item.isShared ? "Shared" : isMine ? "Private" : "Shared with you"}
          </span>
        )}
      </dd>
    </div>
  );
}
