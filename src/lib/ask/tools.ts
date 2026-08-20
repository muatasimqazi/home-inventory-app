import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The real data-access tools behind the Ask widget (docs note: "how much
 * did I spend at Costco last month?", "when did I last buy milk?", "where
 * did I keep my measuring tape?"). Real SQL, not the model eyeballing a
 * dumped record list — Personal Finance PRD Principle 1 is "financial
 * correctness over visual cleverness," and letting an LLM sum a list of
 * dollar amounts (or guess at a location) itself is exactly what that
 * principle rules out. `supabase` is the caller's own session-bound client
 * (lib/supabase/server.ts) — every query here runs under the asking user's
 * real RLS grants, so a private account they can't see in the app can't
 * leak into an answer either.
 *
 * One general-purpose tool per domain rather than several narrow ones —
 * merchant/itemName/dateFrom/dateTo compose on the Finance side, and the
 * model can already answer "when did I last buy X" from a date-descending
 * list's first row without a separate tool for it.
 */
export function createAskTools(supabase: SupabaseClient, householdId: string) {
  const publicStorageBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;

  return {
    searchTransactions: tool({
      description:
        "Search the household's real transactions by vendor/merchant name and/or a specific item name from " +
        "itemized receipt data, optionally restricted to a date range. Returns up to `limit` matching " +
        "transactions (most recent first) plus totalAmount and count reflecting ALL matches, not just the " +
        "ones listed — always use totalAmount/count for spend totals, never sum only the listed rows. Use " +
        "this for spend-by-vendor questions, last-purchase-of-an-item questions, and anything else that " +
        "needs real transaction data. Call it more than once if a question needs more than one search " +
        "(e.g. comparing two vendors).",
      inputSchema: z.object({
        merchant: z.string().optional().describe("Vendor/store name, e.g. 'Costco'. Partial, case-insensitive match against the transaction's merchant/description."),
        itemName: z.string().optional().describe("A specific purchased item to search for within itemized receipt data, e.g. 'milk'. Partial, case-insensitive match."),
        dateFrom: z.string().optional().describe("Inclusive lower bound, YYYY-MM-DD."),
        dateTo: z.string().optional().describe("Inclusive upper bound, YYYY-MM-DD."),
        limit: z.number().int().min(1).max(50).optional().describe("Max transactions in the returned list (default 20)."),
      }),
      execute: async ({ merchant, itemName, dateFrom, dateTo, limit }) => {
        let itemMatchTransactionIds: string[] | null = null;
        const matchedItemNameByTxn: Record<string, string> = {};

        if (itemName) {
          const escaped = itemName.replace(/[%,()]/g, "");
          const { data: items, error: itemsError } = await supabase
            .from("scanned_receipt_line_items")
            .select("transaction_id, raw_item, standard_name")
            .eq("household_id", householdId)
            .not("transaction_id", "is", null)
            .or(`raw_item.ilike.%${escaped}%,standard_name.ilike.%${escaped}%,brand.ilike.%${escaped}%`);
          if (itemsError) return { error: itemsError.message };

          const ids = new Set<string>();
          for (const row of items ?? []) {
            const txnId = row.transaction_id as string;
            ids.add(txnId);
            if (!matchedItemNameByTxn[txnId]) matchedItemNameByTxn[txnId] = (row.standard_name as string) || (row.raw_item as string);
          }
          itemMatchTransactionIds = Array.from(ids);
          if (itemMatchTransactionIds.length === 0) {
            return { transactions: [], totalAmount: 0, count: 0 };
          }
        }

        let query = supabase
          .from("transactions")
          .select("id, merchant, description, amount, occurred_at, type")
          .eq("household_id", householdId)
          .is("trashed_at", null);

        if (merchant) {
          const escaped = merchant.replace(/[%,()]/g, "");
          query = query.or(`merchant.ilike.%${escaped}%,description.ilike.%${escaped}%`);
        }
        if (itemMatchTransactionIds) query = query.in("id", itemMatchTransactionIds);
        if (dateFrom) query = query.gte("occurred_at", dateFrom);
        if (dateTo) query = query.lte("occurred_at", dateTo);

        const { data, error } = await query.order("occurred_at", { ascending: false });
        if (error) return { error: error.message };

        const rows = data ?? [];
        const totalAmount = Math.round(rows.reduce((sum, t) => sum + Number(t.amount), 0) * 100) / 100;
        const capped = rows.slice(0, limit ?? 20);

        return {
          transactions: capped.map((t) => ({
            id: t.id as string,
            merchant: t.merchant as string | null,
            description: t.description as string | null,
            amount: Number(t.amount),
            date: t.occurred_at as string,
            type: t.type as string,
            matchedItem: matchedItemNameByTxn[t.id as string] ?? undefined,
          })),
          totalAmount,
          count: rows.length,
        };
      },
    }),

    findInventoryItems: tool({
      description:
        "Search the household's physical inventory by item name — use for questions like 'where is my X', " +
        "'do we have a Y', 'where did I keep my Z'. Returns matching items with the specific container " +
        "(bin/box) and location they're stored in — walking up nested containers to the real root location " +
        "— plus a photo URL when the item has one. Always state the actual container and location by name in " +
        "your answer (e.g. 'in the Leather Tools bin, in the Office'); never just say 'in your inventory.'",
      inputSchema: z.object({
        itemName: z.string().describe("The item to search for, e.g. 'measuring tape'."),
        limit: z.number().int().min(1).max(20).optional().describe("Max items to return (default 10)."),
      }),
      execute: async ({ itemName, limit }) => {
        const escaped = itemName.replace(/[%,()]/g, "");
        const { data, error } = await supabase
          .from("items")
          .select("id, name, category, notes, container_id, location_id, cover_photo_path")
          .eq("household_id", householdId)
          .eq("status", "active")
          .or(`name.ilike.%${escaped}%,original_detected_name.ilike.%${escaped}%,notes.ilike.%${escaped}%,category.ilike.%${escaped}%`)
          .limit(limit ?? 10);
        if (error) return { error: error.message };

        const items = await Promise.all(
          (data ?? []).map(async (item) => {
            const { locationName, containerPath } = await resolveBreadcrumb(supabase, item.location_id, item.container_id);
            const coverPhotoPath = item.cover_photo_path as string | null;
            return {
              id: item.id as string,
              name: item.name as string,
              category: item.category as string,
              container: containerPath.length > 0 ? containerPath.join(" → ") : null,
              location: locationName,
              photoUrl: coverPhotoPath ? `${publicStorageBase}/item-photos/${coverPhotoPath}` : null,
            };
          })
        );

        return { items, count: items.length };
      },
    }),

    // Household Ledger Implementation Plan Workstream 3, PRD (docs/v4 -
    // Enhanced Features) §25 — the item ↔ transaction link. Additive
    // addition to this file only: joins item_purchases (0017_household_
    // ledger_core.sql) to transactions/scanned_receipt_line_items so the
    // three highest-value questions §25 calls out ("is this still under
    // warranty," insurance-claim prep, "what did this house actually cost
    // us") have a real answer instead of two disconnected domains.
    getItemPurchaseInfo: tool({
      description:
        "Look up purchase and warranty details for a physical inventory item by name — merchant, price, purchase " +
        "date, payment account, receipt availability, and warranty status. Use for 'is X still under warranty', " +
        "'when did we buy X and what did it cost', 'find the receipt for X', or insurance-claim-prep questions. " +
        "Returns one entry per matching item; each item's `purchases` list can be empty (nothing linked yet — say " +
        "so, don't guess) or have more than one entry (bought more than once). `warrantyStatus` is 'unknown' when " +
        "no warranty end date is tracked for that item, not 'not under warranty' — say it isn't tracked, not that " +
        "coverage has lapsed.",
      inputSchema: z.object({
        itemName: z.string().describe("The item to look up, e.g. 'Dyson vacuum'."),
        limit: z.number().int().min(1).max(20).optional().describe("Max items to return (default 10)."),
      }),
      execute: async ({ itemName, limit }) => {
        const escaped = itemName.replace(/[%,()]/g, "");
        const { data: items, error: itemsError } = await supabase
          .from("items")
          .select("id, name, category, extra_details")
          .eq("household_id", householdId)
          .eq("status", "active")
          .or(`name.ilike.%${escaped}%,original_detected_name.ilike.%${escaped}%`)
          .limit(limit ?? 10);
        if (itemsError) return { error: itemsError.message };
        if (!items || items.length === 0) return { items: [], count: 0 };

        const itemIds = items.map((i) => i.id as string);
        // RLS on item_purchases is privacy-aware (0017_household_ledger_
        // core.sql) — a link into a private account's transaction the
        // caller can't see is filtered out here automatically, same as
        // every other finance query in this file.
        const { data: links, error: linksError } = await supabase
          .from("item_purchases")
          .select("id, item_id, transaction_id, scanned_receipt_line_item_id, source")
          .in("item_id", itemIds);
        if (linksError) return { error: linksError.message };

        const transactionIds = Array.from(new Set((links ?? []).map((l) => l.transaction_id).filter((id): id is string => !!id)));
        const lineItemIds = Array.from(new Set((links ?? []).map((l) => l.scanned_receipt_line_item_id).filter((id): id is string => !!id)));

        const [txnsRes, lineItemsRes, receiptAttachmentsRes] = await Promise.all([
          transactionIds.length > 0
            ? supabase.from("transactions").select("id, merchant, description, amount, occurred_at, account_id").in("id", transactionIds)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
          lineItemIds.length > 0
            ? supabase.from("scanned_receipt_line_items").select("id, standard_name, raw_item, line_total_cents").in("id", lineItemIds)
            : Promise.resolve({ data: [] as Record<string, unknown>[], error: null }),
          supabase.from("attachments").select("item_id").eq("household_id", householdId).eq("kind", "receipt").in("item_id", itemIds),
        ]);
        if (txnsRes.error) return { error: txnsRes.error.message };
        if (lineItemsRes.error) return { error: lineItemsRes.error.message };
        if (receiptAttachmentsRes.error) return { error: receiptAttachmentsRes.error.message };

        const accountIds = Array.from(new Set((txnsRes.data ?? []).map((t) => t.account_id as string)));
        const accountsRes =
          accountIds.length > 0 ? await supabase.from("accounts").select("id, name").in("id", accountIds) : { data: [] as Record<string, unknown>[], error: null };
        if (accountsRes.error) return { error: accountsRes.error.message };

        const txnById = new Map((txnsRes.data ?? []).map((t) => [t.id as string, t]));
        const lineItemById = new Map((lineItemsRes.data ?? []).map((li) => [li.id as string, li]));
        const accountNameById = new Map((accountsRes.data ?? []).map((a) => [a.id as string, a.name as string]));
        const itemIdsWithReceipt = new Set((receiptAttachmentsRes.data ?? []).map((a) => a.item_id as string));

        const result = items.map((item) => {
          const itemLinks = (links ?? []).filter((l) => l.item_id === item.id);
          const extraDetails = (item.extra_details ?? {}) as Record<string, string>;
          const warrantyEnd = extraDetails.warrantyEnd ?? null;

          const purchases = itemLinks.map((link) => {
            const txn = link.transaction_id ? txnById.get(link.transaction_id as string) : undefined;
            const lineItem = link.scanned_receipt_line_item_id ? lineItemById.get(link.scanned_receipt_line_item_id as string) : undefined;
            const priceCents = (lineItem?.line_total_cents as number | null | undefined) ?? (txn ? Math.round(Math.abs(Number(txn.amount)) * 100) : null);
            return {
              merchant:
                (txn?.merchant as string | null | undefined) ??
                (txn?.description as string | null | undefined) ??
                (lineItem?.standard_name as string | null | undefined) ??
                (lineItem?.raw_item as string | null | undefined) ??
                null,
              priceDollars: priceCents !== null && priceCents !== undefined ? priceCents / 100 : null,
              purchaseDate: (txn?.occurred_at as string | null | undefined) ?? null,
              paidWith: txn ? (accountNameById.get(txn.account_id as string) ?? null) : null,
              pendingConfirmation: !txn,
              source: link.source as string,
            };
          });

          return {
            itemId: item.id as string,
            itemName: item.name as string,
            category: item.category as string,
            purchases,
            receiptAttached: itemIdsWithReceipt.has(item.id as string),
            warrantyEnd,
            warrantyStatus: warrantyEnd ? (new Date(warrantyEnd).getTime() >= Date.now() ? "active" : "expired") : "unknown",
          };
        });

        return { items: result, count: result.length };
      },
    }),
  };
}

/** Walks a container's parent_container_id chain up to its root, then resolves that root's location — mirrors buildBreadcrumb() in lib/selectors.ts, server-side, for the one tool that needs it. */
async function resolveBreadcrumb(
  supabase: SupabaseClient,
  fallbackLocationId: string | null,
  containerId: string | null
): Promise<{ locationName: string | null; containerPath: string[] }> {
  const containerPath: string[] = [];
  let currentId = containerId;
  let resolvedLocationId = fallbackLocationId;

  while (currentId) {
    const { data: container } = await supabase.from("containers").select("name, parent_container_id, location_id").eq("id", currentId).single();
    if (!container) break;
    containerPath.unshift(container.name as string);
    resolvedLocationId = (container.location_id as string) ?? resolvedLocationId;
    currentId = (container.parent_container_id as string | null) ?? null;
  }

  let locationName: string | null = null;
  if (resolvedLocationId) {
    const { data: location } = await supabase.from("locations").select("name").eq("id", resolvedLocationId).single();
    locationName = (location?.name as string | undefined) ?? null;
  }

  return { locationName, containerPath };
}
