"use client";

import { useInventoryStore } from "@/lib/store";

/**
 * "Belongs to" cell inside the item-detail `<dl>` grid (Household Ledger
 * Implementation Plan §2 — Phase 0 componentization). Extracted with zero
 * behavior change from the inline version it replaces, so Workstream 2
 * (People & ownership UI) has an isolated file to swap to a real picker
 * against `people`/`owner_person_id` without touching the parent page.
 *
 * Still reads the legacy `ownerUserId`/`members` shape on purpose —
 * migrating the read side to `people`/`owner_person_id` is Workstream 2's
 * job, not Phase 0's (see the migration's note on why `owner_user_id`
 * stays as a compatibility shim for now).
 */
export function ItemOwnershipSection({ itemId }: { itemId: string }) {
  const items = useInventoryStore((s) => s.items);
  const members = useInventoryStore((s) => s.members);
  const item = items.find((it) => it.id === itemId);
  if (!item) return null;

  const value = item.ownerUserId
    ? (members.find((m) => m.userId === item.ownerUserId)?.displayName ?? "Unknown")
    : "Shared";

  return (
    <div>
      <dt className="text-caption text-muted-foreground">Belongs to</dt>
      <dd className="mt-1.5 text-body text-ink">{value}</dd>
    </div>
  );
}
