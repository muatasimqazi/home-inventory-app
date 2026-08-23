import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

interface HouseholdDomainsRow {
  id: string;
  finance_enabled: boolean;
  inventory_enabled: boolean;
}

/**
 * Filters candidate rows down to the ones whose household still has the
 * relevant domain enabled (households.finance_enabled/inventory_enabled,
 * 0033_household_domains.sql). Every push cron job (send-due-bills,
 * send-debt-payments-due-today, send-capture-nudges, send-low-stock-alerts)
 * queries its own domain table directly (recurring_bills, transactions,
 * items) — none of those tables know or care about a household's domain
 * choice, so a household that's since opted out of a domain would
 * otherwise keep getting that domain's pushes off whatever rows are still
 * sitting there from before it opted out. This is the one place that
 * check happens, shared rather than reimplemented per job.
 *
 * "both" is for send-capture-nudges specifically: it reads a Finance
 * signal (a transaction) to prompt an Inventory action (log what you
 * bought), so it needs both domains enabled, not just the one its query
 * happens to read from.
 */
export async function filterByEnabledDomain<T extends { household_id: string }>(
  admin: SupabaseClient,
  rows: T[],
  domain: "finance" | "inventory" | "both"
): Promise<T[]> {
  if (rows.length === 0) return rows;
  const householdIds = [...new Set(rows.map((r) => r.household_id))];
  const { data } = await admin.from("households").select("id, finance_enabled, inventory_enabled").in("id", householdIds);
  const enabledIds = new Set(
    ((data ?? []) as HouseholdDomainsRow[])
      .filter((h) => (domain === "finance" ? h.finance_enabled : domain === "inventory" ? h.inventory_enabled : h.finance_enabled && h.inventory_enabled))
      .map((h) => h.id)
  );
  return rows.filter((r) => enabledIds.has(r.household_id));
}
