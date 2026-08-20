"use client";

/**
 * Purchase/warranty info for an item — PRD (docs/v4 - Enhanced Features)
 * §25 "Physical Item ↔ Financial Transaction", Household Ledger
 * Implementation Plan Workstream 3. This is the product's core
 * differentiator (see the Implementation Plan's note on Workstream 3) —
 * price, merchant, payment account, receipt, and warranty status, read
 * through the `item_purchases` link table (0017_household_ledger_core.sql).
 *
 * Phase 0 scaffolds this as its own component with no behavior yet, purely
 * so it exists as an isolated file Workstream 3 fills in rather than a new
 * block inserted into item-detail's page component later. Renders nothing
 * for now — a section with no real data behind it would be a promise the
 * product doesn't keep, and item_purchases has no rows until Workstream 3
 * ships the linking UI that creates them.
 */
export function ItemPurchaseSection({ itemId }: { itemId: string }) {
  void itemId;
  return null;
}
