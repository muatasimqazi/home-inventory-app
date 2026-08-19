import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The one real data-access tool behind /finance/ask (docs note: "how much
 * did I spend at Costco last month?", "when did I last buy milk?"). Real
 * SQL aggregation, not the model eyeballing a dumped transaction list —
 * Personal Finance PRD Principle 1 is "financial correctness over visual
 * cleverness," and letting an LLM sum a list of dollar amounts itself is
 * exactly the kind of thing that principle rules out. `supabase` is the
 * caller's own session-bound client (lib/supabase/server.ts) — every query
 * here runs under the asking user's real RLS grants, so a private account
 * they can't see in the app can't leak into an answer either.
 *
 * One general-purpose search tool rather than several narrow ones
 * (searchByVendor, findLastPurchase, ...) — merchant and itemName compose,
 * and the model can already answer "when did I last buy X" from a
 * date-descending list's first row without a separate tool for it.
 */
export function createFinanceAskTools(supabase: SupabaseClient, householdId: string) {
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
            merchant: t.merchant,
            description: t.description,
            amount: Number(t.amount),
            date: t.occurred_at,
            type: t.type,
            matchedItem: matchedItemNameByTxn[t.id as string] ?? undefined,
          })),
          totalAmount,
          count: rows.length,
        };
      },
    }),
  };
}
