import "server-only";
import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { warrantyStatus } from "@/lib/selectors";
import { loadReferenceItems, matchByName, matchReferenceLocation } from "@/lib/reference/starter-inventory";
import { newId } from "@/lib/id";
import { formatShortDate } from "@/lib/format";
import type { ActivityAction, ActivityEntityType, ActivityLogEntry, HouseholdTask, Note, TaskCategoryRecord, TaskSubtask } from "@/lib/types";
import { activityLogEntryToInsertRow, householdTaskToInsertRow, noteToInsertRow, taskCategoryToInsertRow, taskSubtaskToInsertRow } from "@/lib/supabase/mappers";

/**
 * Strips characters that would otherwise change what a raw user string
 * means once it's spliced into an ilike pattern or a PostgREST `.or()`
 * filter string — `%`/`_` are ILIKE wildcards (a literal "_" in a search
 * term like "water_shutoff" would otherwise match "waterXshutoff" too,
 * one character too loose to be a real bug worth leaving in five separate
 * copies of this same regex), `,`/`(`/`)` are PostgREST's own filter-string
 * separators. One shared helper instead of five independently-maintained
 * copies of the same regex, so the next new character that needs handling
 * here only needs adding once.
 */
function escapeSearchInput(raw: string): string {
  return raw.replace(/[%_,()]/g, "");
}

/** Same fire-and-forget shape logActivity() (lib/store.ts) uses client-side — a household's Activity feed should show what the Ask assistant did on the asking user's behalf exactly the same way it shows anything done through the UI, so this never silently skips it. Logged, never thrown — losing one log entry to a transient error isn't worth failing the create it's documenting. */
async function logAiActivity(
  supabase: SupabaseClient,
  entry: { householdId: string; actorUserId: string; entityType: ActivityEntityType; entityId: string; entityName: string; action: ActivityAction }
) {
  const row: ActivityLogEntry = { id: newId(), createdAt: new Date().toISOString(), ...entry };
  const { error } = await supabase.from("activity_log").insert(activityLogEntryToInsertRow(row));
  if (error) console.error("Ask tool: failed to log activity:", error.message);
}

/**
 * Resolves a freeform task-category name (as the model/user said it, e.g.
 * "grocery" or "meal prep") to a real task_categories row id — matching
 * one of the household's own categories (the 5 seeded system defaults
 * plus any custom ones) case-insensitively, or creating a new
 * household-scoped one when nothing matches. Mirrors
 * getOrCreateTaskCategory() in lib/store.ts exactly, just server-side
 * against the caller's own session-bound client instead of local state.
 */
async function resolveTaskCategoryId(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  categoryName: string
): Promise<{ id: string } | { error: string }> {
  const name = categoryName.trim() || "Other";
  const { data, error } = await supabase.from("task_categories").select("id, name").or(`household_id.eq.${householdId},household_id.is.null`);
  if (error) return { error: error.message };
  const existing = (data ?? []).find((c) => (c.name as string).toLowerCase() === name.toLowerCase());
  if (existing) return { id: existing.id as string };

  const created: TaskCategoryRecord = {
    id: newId(),
    householdId,
    name,
    isDefault: false,
    createdByUserId: userId,
    createdAt: new Date().toISOString(),
  };
  const { error: insertError } = await supabase.from("task_categories").insert(taskCategoryToInsertRow(created));
  if (insertError) return { error: insertError.message };
  return { id: created.id };
}

/**
 * The real writes behind createNote/createTask/addSubtaskToTask below —
 * pulled out into standalone functions so /api/v1/ask/confirm can run the
 * exact same insert once a user actually taps Confirm on a pending-action
 * card, instead of duplicating this logic. Nothing in this file calls
 * these at *propose* time — see each tool's own comment on why.
 */
export async function performCreateNote(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  payload: { title: string; content: string; isShared: boolean }
): Promise<{ note: Note } | { error: string }> {
  const now = new Date().toISOString();
  const note: Note = {
    id: newId(),
    householdId,
    ownerUserId: userId,
    title: payload.title,
    content: payload.content,
    isShared: payload.isShared,
    pinned: false,
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
    createdAt: now,
    updatedAt: now,
  };
  const { error } = await supabase.from("notes").insert(noteToInsertRow(note));
  if (error) return { error: error.message };
  await logAiActivity(supabase, { householdId, actorUserId: userId, entityType: "note", entityId: note.id, entityName: note.title || "Untitled note", action: "created" });
  return { note };
}

export async function performCreateTask(
  supabase: SupabaseClient,
  householdId: string,
  userId: string,
  payload: { title: string; description: string; dueAt: string; category: string }
): Promise<{ task: HouseholdTask } | { error: string }> {
  const categoryResult = await resolveTaskCategoryId(supabase, householdId, userId, payload.category);
  if ("error" in categoryResult) return { error: categoryResult.error };

  const now = new Date().toISOString();
  const task: HouseholdTask = {
    id: newId(),
    householdId,
    title: payload.title,
    description: payload.description,
    categoryId: categoryResult.id,
    linkedEntityType: null,
    linkedEntityId: null,
    assignedToPersonId: null,
    scheduleType: "one_time",
    dueAt: payload.dueAt,
    recurrenceRule: null,
    isActive: true,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    permanentlyDeleteAfter: null,
  };
  const { error } = await supabase.from("household_tasks").insert(householdTaskToInsertRow(task));
  if (error) return { error: error.message };
  await logAiActivity(supabase, { householdId, actorUserId: userId, entityType: "household_task", entityId: task.id, entityName: task.title, action: "created" });
  return { task };
}

export async function performAddSubtaskToTask(
  supabase: SupabaseClient,
  payload: { householdId: string; taskId: string; subtaskTitle: string }
): Promise<{ subtask: TaskSubtask } | { error: string }> {
  const { count, error: countError } = await supabase.from("task_subtasks").select("id", { count: "exact", head: true }).eq("task_id", payload.taskId);
  if (countError) return { error: countError.message };

  const subtask: TaskSubtask = {
    id: newId(),
    householdId: payload.householdId,
    taskId: payload.taskId,
    title: payload.subtaskTitle,
    isCompleted: false,
    position: count ?? 0,
    createdAt: new Date().toISOString(),
  };
  const { error } = await supabase.from("task_subtasks").insert(taskSubtaskToInsertRow(subtask));
  if (error) return { error: error.message };
  return { subtask };
}

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
 *
 * Notes/Tasks tools below (search + create + add-subtask) are the one
 * exception to "every tool here is read-only" — createNote/createTask/
 * addSubtaskToTask never write anything themselves. Each just returns a
 * `pendingAction` describing the write it would make; the actual insert
 * only happens in performCreateNote/performCreateTask/
 * performAddSubtaskToTask above, called from /api/v1/ask/confirm once a
 * user taps Confirm on the resulting card in the chat (lib/ask/ask.ts's
 * extractPendingActions, rendered by ask-conversation-entry.tsx) — a real
 * Verification gate (explicit go/no-go before anything saves), not just a
 * post-hoc "here's what happened" card. Every confirmed write is still
 * logged to the household's real Activity feed (logAiActivity above)
 * exactly like a manual create would be. Note none of the tools *in this
 * factory* need the asking user's id — that only matters once a write is
 * actually confirmed (performCreateNote/performCreateTask's
 * ownerUserId/createdByUserId, logAiActivity's actorUserId), which happens
 * in /api/v1/ask/confirm, not here.
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
          const escaped = escapeSearchInput(itemName);
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
          const escaped = escapeSearchInput(merchant);
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

    // Category matching mirrors categoriesForTransaction() in
    // selectors.ts: a transaction_categories tag-link, when one exists,
    // wins over the primary category_id — not categoryBreakdownForMonth's
    // simpler primary-only grouping — since "how much did I spend on
    // dining out" means every transaction tagged that way, full stop, the
    // same definition the Transactions page's own category filter uses.
    getSpendByCategory: tool({
      description:
        "Get real spend totals by category — for 'how much have I spent on X' questions (X being a spending " +
        "category like 'dining out', 'groceries', 'subscriptions') and for 'what's my biggest spending " +
        "category' or 'how much have I spent [overall]' questions. Always compute dateFrom/dateTo yourself " +
        "from what was asked, relative to today's date, before calling this — 'this month' means the 1st of " +
        "the current month through today, 'this week' means the last 7 days including today; never leave " +
        "both blank unless the question really means all-time. Pass `category` for a specific category; omit " +
        "it to get the full ranked breakdown across every category for the range instead — use that for " +
        "'biggest category' or an overall spend total (the response's totalSpend is already the real summed " +
        "total; never add up the category list yourself). If the result has `categoryNotFound` set, the name " +
        "didn't match any real category the household uses — say so plainly and offer the `availableCategories` " +
        "list rather than guessing a number.",
      inputSchema: z.object({
        category: z
          .string()
          .optional()
          .describe("A spending category as the user described it, e.g. 'dining out'. Freeform — matched against the household's real categories here, no need to canonicalize it yourself. Omit for the full ranked breakdown."),
        dateFrom: z.string().optional().describe("Inclusive lower bound, YYYY-MM-DD — compute this yourself from the question; don't leave it blank unless the question means all-time."),
        dateTo: z.string().optional().describe("Inclusive upper bound, YYYY-MM-DD — usually today."),
      }),
      execute: async ({ category, dateFrom, dateTo }) => {
        const { data: categoryRows, error: categoriesError } = await supabase
          .from("categories")
          .select("id, name")
          .or(`household_id.eq.${householdId},household_id.is.null`)
          .neq("status", "trashed");
        if (categoriesError) return { error: categoriesError.message };
        const allCategories = (categoryRows ?? []) as { id: string; name: string }[];
        const nameById = new Map(allCategories.map((c) => [c.id, c.name]));

        let matchedCategoryIds: Set<string> | null = null;
        if (category) {
          const needle = category.trim().toLowerCase();
          const exact = allCategories.filter((c) => c.name.toLowerCase() === needle);
          const matched = exact.length > 0 ? exact : allCategories.filter((c) => c.name.toLowerCase().includes(needle));
          if (matched.length === 0) {
            return {
              categoryNotFound: true,
              availableCategories: allCategories.map((c) => c.name).slice(0, 30),
              message: `No category matching "${category}" found in this household.`,
            };
          }
          matchedCategoryIds = new Set(matched.map((c) => c.id));
        }

        // Same "spend" definition cashFlowForMonth/categoryBreakdownForMonth
        // use (selectors.ts): expense-typed, not trashed, not excluded from
        // reports. household_id filter is explicit even under RLS, same
        // defense-in-depth style searchTransactions above already uses.
        let query = supabase
          .from("transactions")
          .select("id, merchant, description, amount, occurred_at, category_id")
          .eq("household_id", householdId)
          .eq("type", "expense")
          .eq("excluded_from_reports", false)
          .is("trashed_at", null);
        if (dateFrom) query = query.gte("occurred_at", dateFrom);
        if (dateTo) query = query.lte("occurred_at", dateTo);
        const { data: txnRows, error: txnError } = await query;
        if (txnError) return { error: txnError.message };
        const transactions = (txnRows ?? []) as { id: string; merchant: string | null; description: string | null; amount: number; occurred_at: string; category_id: string | null }[];

        // Tag-style links for exactly these transactions — a second,
        // separate query rather than an embedded relation select, same
        // two-step style searchTransactions' own item-name matching above
        // already uses.
        const txnIds = transactions.map((t) => t.id);
        const { data: tagRows, error: tagError } =
          txnIds.length > 0
            ? await supabase.from("transaction_categories").select("transaction_id, category_id").in("transaction_id", txnIds)
            : { data: [] as { transaction_id: string; category_id: string }[], error: null };
        if (tagError) return { error: tagError.message };
        const tagsByTxnId = new Map<string, string[]>();
        for (const row of tagRows ?? []) {
          const list = tagsByTxnId.get(row.transaction_id as string) ?? [];
          list.push(row.category_id as string);
          tagsByTxnId.set(row.transaction_id as string, list);
        }
        /** Tag-links win when present, else the primary category_id, else uncategorized — categoriesForTransaction()'s exact rule. */
        function effectiveCategoryIds(t: (typeof transactions)[number]): string[] {
          const tags = tagsByTxnId.get(t.id);
          if (tags && tags.length > 0) return tags;
          return t.category_id ? [t.category_id] : [];
        }

        if (matchedCategoryIds) {
          const inCategory = transactions.filter((t) => effectiveCategoryIds(t).some((id) => matchedCategoryIds!.has(id)));
          const totalAmount = Math.round(inCategory.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0) * 100) / 100;
          const top = [...inCategory].sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))).slice(0, 3);
          return {
            category: [...matchedCategoryIds].map((id) => nameById.get(id)).filter(Boolean).join(", "),
            totalAmount,
            count: inCategory.length,
            topTransactions: top.map((t) => ({
              id: t.id,
              merchant: t.merchant,
              description: t.description,
              amount: Number(t.amount),
              date: t.occurred_at,
            })),
          };
        }

        // No category given — full ranked breakdown, same grouping
        // categoryBreakdownForMonth uses, just over a flexible range
        // instead of a fixed month.
        const totals = new Map<string, number>();
        for (const t of transactions) {
          const ids = effectiveCategoryIds(t);
          const key = ids[0] ?? "uncategorized";
          totals.set(key, (totals.get(key) ?? 0) + Math.abs(Number(t.amount)));
        }
        const categories = Array.from(totals.entries())
          .map(([id, amount]) => ({ name: id === "uncategorized" ? "Uncategorized" : (nameById.get(id) ?? "Uncategorized"), amount: Math.round(amount * 100) / 100 }))
          .sort((a, b) => b.amount - a.amount);
        const totalSpend = Math.round(categories.reduce((sum, c) => sum + c.amount, 0) * 100) / 100;
        return { categories, totalSpend };
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
        const escaped = escapeSearchInput(itemName);
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

    // Additive key (Household Ledger Implementation Plan §3/§4, Workstream
    // 5 — Home Map): a pinned-location lookup alongside the two tools
    // above, not a refactor of either. `pinned_locations` (PRD §29) is a
    // handful of simple records — water shutoff, panel, HVAC, network,
    // renovation wall photos — not a full home-systems catalog, so this
    // stays a single freeform-search tool rather than one per category.
    findPinnedLocations: tool({
      description:
        "Search the household's Home Map — pinned critical locations like the main water shutoff, electrical " +
        "panel, gas shutoff, HVAC, network equipment, and renovation wall photos (photographed before drywall " +
        "went up). Use for questions like 'where's the water shutoff', 'where's our electrical panel', or 'do " +
        "we have a photo of the wall before it was closed up'. Returns each pin's location note (e.g. 'Garage " +
        "→ East Wall') and a photo URL when one was saved. This is not a floor plan or a full home-systems " +
        "catalog — only these deliberately-pinned spots exist.",
      inputSchema: z.object({
        query: z.string().optional().describe("Freeform search against the pin's name, e.g. 'water' or 'panel'. Omit to list every pinned location."),
        category: z
          .enum(["water_shutoff", "electrical_panel", "gas_shutoff", "hvac", "network", "wall_photo", "other"])
          .optional()
          .describe("Restrict results to one category."),
      }),
      execute: async ({ query, category }) => {
        let dbQuery = supabase.from("pinned_locations").select("id, name, category, photo_path, location_note").eq("household_id", householdId);
        if (category) dbQuery = dbQuery.eq("category", category);
        if (query) {
          const escaped = escapeSearchInput(query);
          dbQuery = dbQuery.ilike("name", `%${escaped}%`);
        }
        const { data, error } = await dbQuery;
        if (error) return { error: error.message };

        // photo_path lives in the private "attachments" bucket (not the
        // public "item-photos" one findInventoryItems reads above — see
        // PinnedLocation's own doc comment in lib/types.ts for why), so a
        // usable URL needs a real signed-URL call per pin with a photo,
        // same as the client's own on-demand fetch (pinned-location-photo.tsx).
        const pins = await Promise.all(
          (data ?? []).map(async (pin) => {
            const photoPath = pin.photo_path as string | null;
            let photoUrl: string | null = null;
            if (photoPath) {
              const { data: signed } = await supabase.storage.from("attachments").createSignedUrl(photoPath, 300);
              photoUrl = signed?.signedUrl ?? null;
            }
            return {
              id: pin.id as string,
              name: pin.name as string,
              category: pin.category as string,
              locationNote: pin.location_note as string | null,
              photoUrl,
            };
          })
        );

        return { pinnedLocations: pins, count: pins.length };
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
        const escaped = escapeSearchInput(itemName);
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
            warrantyStatus: warrantyStatus(warrantyEnd),
          };
        });

        return { items: result, count: result.length };
      },
    }),

    // Docs/v4 "Enhanced Features" — "what am I missing from my kitchen"
    // style questions. Reuses the onboarding/typeahead reference catalog
    // (lib/reference/starter-inventory.ts) that already backs the
    // add-item suggestion typeahead, rather than inventing a second
    // "commonly kept items" dataset — this is the same 22-bucket, ~2,662-
    // item catalog, just read from the other direction (what's missing,
    // not what to suggest while typing). A suggestion feature, not a
    // precision-critical one (unlike the finance tools above): the
    // "already have" check is deliberately a loose substring-containment
    // match, same conservative spirit as escapeSearchInput/matchReference
    // Location elsewhere in this codebase, not a rewrite of matching
    // philosophy.
    findMissingCommonItems: tool({
      description:
        "For 'what am I missing from my X' or 'what should I have in my X' questions — compares a real " +
        "household Location's actual inventory against a generic reference catalog of commonly-kept items for " +
        "that kind of space (e.g. kitchen, garage, bathroom) and reports what's commonly kept there that this " +
        "household doesn't seem to have yet. `locationName` can be whatever the user said (e.g. 'kitchen', 'the " +
        "garage') — it's matched against the household's real Locations here, no need to canonicalize it " +
        "yourself. If the result has `locationNotFound` or `noReferenceData` set, say so plainly rather than " +
        "guessing. If it has `locationAmbiguous` set, more than one of the household's own Locations could match " +
        "what was said — list the candidate names from `candidates` and ask which one was meant, rather than " +
        "picking one yourself. This is a suggestion feature, not an inventory audit — an imperfect 'already " +
        "have' match is expected, so phrase the answer as a rough suggestion (e.g. 'you have about N of the M " +
        "common items'), not a precise count; if `missingItemsTruncated` is true, say the list below is a " +
        "partial sample (e.g. 'including') rather than implying it's everything.",
      inputSchema: z.object({
        locationName: z.string().describe("The location as the user described it, e.g. 'kitchen' or 'garage'. Freeform — not required to be an exact Location name."),
      }),
      execute: async ({ locationName }) => {
        // Started immediately, not after the locations query/matching below
        // — it has no data dependency on either, so it can load/parse
        // concurrently with that DB round trip instead of serialized
        // behind it.
        const referenceItemsPromise = loadReferenceItems();

        // .order("name") makes the (rare) exact-name-tie case — two real
        // Locations literally sharing a name, which locations.name has no
        // uniqueness constraint against — at least deterministic across
        // calls, even though it's still an arbitrary pick between two
        // otherwise-indistinguishable Locations either way.
        const { data: locations, error: locationsError } = await supabase
          .from("locations")
          .select("id, name")
          .eq("household_id", householdId)
          .eq("status", "active")
          .order("name");
        if (locationsError) return { error: locationsError.message };

        const locationMatch = matchHouseholdLocation(locations ?? [], locationName);
        if (locationMatch.kind === "none") {
          return {
            locationNotFound: true,
            message: `No location named "${locationName}" found in this household.`,
          };
        }
        if (locationMatch.kind === "ambiguous") {
          return {
            locationAmbiguous: true,
            candidates: locationMatch.candidates.map((l) => l.name),
            message: `More than one location could match "${locationName}" — ask which one was meant.`,
          };
        }
        const matchedLocation = locationMatch.location;

        const referenceLocation = matchReferenceLocation(matchedLocation.name);
        if (!referenceLocation) {
          return {
            noReferenceData: true,
            locationName: matchedLocation.name,
            message: `No reference data available for a location like "${matchedLocation.name}".`,
          };
        }

        const [allReferenceItems, { data: realItems, error: itemsError }] = await Promise.all([
          referenceItemsPromise,
          supabase.from("items").select("name").eq("household_id", householdId).eq("location_id", matchedLocation.id).eq("status", "active"),
        ]);
        if (itemsError) return { error: itemsError.message };

        const referenceItemsHere = allReferenceItems.filter((it) => it.location === referenceLocation);
        const realItemNames = (realItems ?? []).map((i) => (i.name as string).toLowerCase());

        const missing = referenceItemsHere.filter((refItem) => {
          const refName = refItem.name.toLowerCase();
          return !realItemNames.some((realName) => {
            if (realName === refName) return true;
            // Containment only counts once both sides are long enough to
            // be a meaningful phrase match — a short, generic real item
            // name like "Bag" or "Box" would otherwise satisfy containment
            // against many unrelated reference items ("Trash Bags",
            // "Freezer Bags", ...) purely by being a short substring of a
            // longer phrase, inflating haveCount for a location that's
            // actually still mostly empty.
            if (Math.min(realName.length, refName.length) < 5) return false;
            return realName.includes(refName) || refName.includes(realName);
          });
        });

        const MISSING_ITEMS_LIMIT = 20;
        return {
          locationName: matchedLocation.name,
          totalCommonItems: referenceItemsHere.length,
          haveCount: referenceItemsHere.length - missing.length,
          missingCount: missing.length,
          missingItems: missing.slice(0, MISSING_ITEMS_LIMIT).map((it) => it.name),
          missingItemsTruncated: missing.length > MISSING_ITEMS_LIMIT,
        };
      },
    }),

    searchNotes: tool({
      description:
        "Search the household's Notes by title/content — use for 'find my note about X', 'what does my note " +
        "say about Y', or to check whether a note already exists before creating a new one. RLS already scopes " +
        "results to what the asking user can see (their own personal notes plus every shared note), so a " +
        "private note someone else owns simply won't appear — never mention privacy/permissions in your answer.",
      inputSchema: z.object({
        query: z.string().optional().describe("Freeform search against the note's title/content. Omit to list the most recently updated notes."),
        limit: z.number().int().min(1).max(20).optional().describe("Max notes to return (default 10)."),
      }),
      execute: async ({ query, limit }) => {
        let dbQuery = supabase.from("notes").select("id, title, content, is_shared, pinned, updated_at").eq("household_id", householdId).eq("status", "active");
        if (query) {
          const escaped = escapeSearchInput(query);
          dbQuery = dbQuery.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
        }
        const { data, error } = await dbQuery.order("updated_at", { ascending: false }).limit(limit ?? 10);
        if (error) return { error: error.message };

        const notes = (data ?? []).map((n) => ({
          id: n.id as string,
          title: (n.title as string) || "Untitled note",
          snippet: ((n.content as string) || "").slice(0, 200),
          isShared: n.is_shared as boolean,
          pinned: n.pinned as boolean,
          updatedAt: n.updated_at as string,
        }));
        return { notes, count: notes.length };
      },
    }),

    searchTasks: tool({
      description:
        "Search the household's Tasks (reminders, chores, appointments) by title/description and/or status — " +
        "use for 'what tasks do I have', 'is there already a task for X', 'what's overdue', 'what's due this " +
        "week', and to check for an existing task before creating a duplicate. Tasks have no per-record " +
        "privacy — every household member's tasks are visible to everyone.",
      inputSchema: z.object({
        query: z.string().optional().describe("Freeform search against the task's title/description. Omit to list by due date."),
        status: z
          .enum(["active", "overdue", "completed", "all"])
          .optional()
          .describe("'active' = not yet done (default) — includes recurring tasks, which are never permanently 'done'. 'overdue' = active and past due. 'completed' = one-time tasks already marked done. 'all' = every status."),
        dueFrom: z.string().optional().describe("Inclusive lower bound on due date, YYYY-MM-DD."),
        dueTo: z.string().optional().describe("Inclusive upper bound on due date, YYYY-MM-DD."),
        limit: z.number().int().min(1).max(30).optional().describe("Max tasks to return (default 15)."),
      }),
      execute: async ({ query, status, dueFrom, dueTo, limit }) => {
        let dbQuery = supabase
          .from("household_tasks")
          .select("id, title, description, category_id, due_at, is_active, schedule_type")
          .eq("household_id", householdId)
          .is("trashed_at", null);
        if (query) {
          const escaped = escapeSearchInput(query);
          dbQuery = dbQuery.or(`title.ilike.%${escaped}%,description.ilike.%${escaped}%`);
        }
        if (status === "completed") dbQuery = dbQuery.eq("is_active", false);
        else if (status !== "all") dbQuery = dbQuery.eq("is_active", true);
        if (dueFrom) dbQuery = dbQuery.gte("due_at", dueFrom);
        if (dueTo) dbQuery = dbQuery.lte("due_at", dueTo);

        const { data, error } = await dbQuery.order("due_at", { ascending: true }).limit(limit ?? 15);
        if (error) return { error: error.message };

        // Filtered in JS, not SQL — "overdue" is relative to the moment
        // this runs, not a stored column.
        const nowIso = new Date().toISOString();
        const rows = (status === "overdue" ? (data ?? []).filter((t) => (t.due_at as string) < nowIso) : (data ?? [])) as {
          id: string;
          title: string;
          description: string | null;
          category_id: string;
          due_at: string;
          is_active: boolean;
          schedule_type: string;
        }[];

        const categoryIds = Array.from(new Set(rows.map((t) => t.category_id)));
        const { data: categoryRows, error: categoryError } =
          categoryIds.length > 0
            ? await supabase.from("task_categories").select("id, name").in("id", categoryIds)
            : { data: [] as { id: string; name: string }[], error: null };
        if (categoryError) return { error: categoryError.message };
        const categoryNameById = new Map((categoryRows ?? []).map((c) => [c.id as string, c.name as string]));

        const tasks = rows.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description || null,
          dueAt: t.due_at,
          category: categoryNameById.get(t.category_id) ?? "Other",
          isActive: t.is_active,
          recurring: t.schedule_type === "recurring",
        }));
        return { tasks, count: tasks.length };
      },
    }),

    // createNote/createTask/addSubtaskToTask below PROPOSE a write instead
    // of performing it — see this file's own top comment for why real
    // confirmation (not just a post-hoc reference card) is worth the
    // friction here. Each returns a `pendingAction` (lib/ask/ask.ts's
    // extractPendingActions pulls it out into a real Confirm/Cancel card
    // in the chat) carrying everything /api/v1/ask/confirm needs to
    // actually run performCreateNote/performCreateTask/
    // performAddSubtaskToTask above once the user taps Confirm. Nothing in
    // this file inserts a note, a task, or a subtask directly anymore —
    // only those three exported perform* functions do, and only when
    // called from that confirm route.
    createNote: tool({
      description:
        "Drafts a Note for this household — use when the user explicitly asks to jot something down, save/" +
        "write a note, or remember something in note form (not for anything with a due date or that needs " +
        "doing — use createTask for that instead). This does NOT save anything by itself: it shows the user a " +
        "Confirm/Cancel card and nothing is written until they tap Confirm. Say so in your answer (e.g. " +
        "'I've drafted that note — tap Confirm to save it'), never 'saved'/'created'/'added' as if it already " +
        "happened. Personal by default; only set isShared true when the user says to share it with the household.",
      inputSchema: z.object({
        title: z.string().describe("A short title. Empty string is fine if the user gave no title — the content still saves."),
        content: z.string().describe("The note's body, in Markdown."),
        isShared: z.boolean().optional().describe("True to make it visible to the whole household; omit/false keeps it personal to the asking user (the default)."),
      }),
      execute: async ({ title, content, isShared }) => ({
        pendingAction: {
          kind: "createNote",
          summary: `Save a note titled "${title.trim() || "Untitled note"}"${isShared ? " — shared with the household" : ""}`,
          payload: { title, content, isShared: isShared ?? false },
        },
      }),
    }),

    createTask: tool({
      description:
        "Drafts a Task (reminder, chore, or appointment) for this household — use when the user asks to add a " +
        "task, set a reminder, or schedule something to do. This does NOT save anything by itself: it shows " +
        "the user a Confirm/Cancel card and nothing is written until they tap Confirm. Say so in your answer " +
        "(e.g. 'I've drafted that task, due tomorrow at 9am — tap Confirm to save it'), never 'scheduled'/" +
        "'added'/'created' as if it already happened. Always compute `dueAt` yourself as a full ISO 8601 " +
        "datetime relative to today's date given above — default to 9:00 AM if no time was mentioned " +
        "('tomorrow' means tomorrow at 9am, not this exact moment). `category` is freeform (e.g. 'chore', " +
        "'grocery', 'maintenance', 'appointment') — matched against the household's real categories at " +
        "confirm time, or a new one created then if nothing matches; omit it for a generic 'Other' bucket.",
      inputSchema: z.object({
        title: z.string().describe("A short, clear task title, e.g. 'Take out the trash' or 'Dentist appointment'."),
        description: z.string().optional().describe("Optional extra detail."),
        dueAt: z.string().describe("Full ISO 8601 datetime, e.g. '2026-09-05T09:00:00.000Z' — compute this yourself from what the user said, relative to today's date."),
        category: z.string().optional().describe("Freeform category, e.g. 'chore', 'grocery', 'maintenance', 'appointment'. Omit for 'Other'."),
      }),
      execute: async ({ title, description, dueAt, category }) => ({
        pendingAction: {
          kind: "createTask",
          summary: `Create task "${title}", due ${formatShortDate(dueAt)}`,
          payload: { title, description: description ?? "", dueAt, category: category ?? "Other" },
        },
      }),
    }),

    addSubtaskToTask: tool({
      description:
        "Proposes adding one checklist item (a subtask) to an EXISTING Task — use for 'add X to my grocery " +
        "list', 'add a step to the Y task'. `taskTitle` is matched against the household's real active task " +
        "titles freeform (this lookup itself is read-only and runs immediately). If `taskAmbiguous` comes " +
        "back, more than one task could match — list the candidates and ask which was meant rather than " +
        "picking one yourself. If `taskNotFound` comes back, say so rather than silently proposing a brand-new " +
        "task instead — that's what createTask is for, and only if the user actually wants a new one. On a " +
        "real match, this does NOT save the subtask by itself: it shows the user a Confirm/Cancel card and " +
        "nothing is written until they tap Confirm — say so in your answer (e.g. 'I've drafted adding \"milk\" " +
        "to your grocery list — tap Confirm to save it'), never 'added' as if it already happened.",
      inputSchema: z.object({
        taskTitle: z.string().describe("The existing task to add to, as the user described it, e.g. 'grocery list' or 'move out'."),
        subtaskTitle: z.string().describe("The checklist item to add, e.g. 'milk' or 'call the movers'."),
      }),
      execute: async ({ taskTitle, subtaskTitle }) => {
        const { data, error } = await supabase
          .from("household_tasks")
          .select("id, title")
          .eq("household_id", householdId)
          .eq("is_active", true)
          .is("trashed_at", null);
        if (error) return { error: error.message };

        const candidates = (data ?? []) as { id: string; title: string }[];
        const matches = matchByName(candidates, (t) => t.title, taskTitle);
        if (matches.length === 0) {
          return { taskNotFound: true, message: `No active task matching "${taskTitle}" found.` };
        }
        if (matches.length > 1) {
          return {
            taskAmbiguous: true,
            candidates: matches.map((t) => t.title),
            message: `More than one task could match "${taskTitle}" — ask which one was meant.`,
          };
        }
        const task = matches[0];

        return {
          pendingAction: {
            kind: "addSubtaskToTask",
            summary: `Add "${subtaskTitle}" to "${task.title}"`,
            payload: { taskId: task.id, taskTitle: task.title, subtaskTitle },
          },
        };
      },
    }),

    // "Remind me what to wear every day" and its relatives — not a new
    // content type, just a chat-native on/off switch for the daily weather
    // push (send-weather-alerts/route.ts, weatherAlertCopy()) that already
    // exists for exactly this, same event key Settings > Notifications
    // exposes (domain_key "weather", event_type "daily_summary"). Unlike
    // createNote/createTask/addSubtaskToTask above, this executes right
    // away instead of returning a pendingAction — flipping a personal
    // notification preference is the same low-friction, instantly-
    // reversible action the Settings page itself performs with no
    // confirmation step, not a new piece of content that needs a
    // Confirm/Cancel gate.
    setWeatherReminder: tool({
      description:
        "Turns the household's daily weather push notification on or off for the asking user — the same " +
        "preference exposed in Settings > Notifications, and the only real 'what to wear' reminder this app " +
        "has (it summarizes today's condition and high/low, and calls out real rain chance or an extreme high/" +
        "low). Use for 'remind me what to wear every day', 'send me a daily weather update', 'turn off the " +
        "weather notifications', 'stop reminding me about the weather'. Executes immediately — never phrase " +
        "this as a draft or say 'tap Confirm'; say what actually happened (e.g. 'Turned on your daily weather " +
        "reminder'). If `locationSet` comes back false, the preference is on but the household hasn't set a " +
        "home location yet, so there's nothing yet to report — tell the user to tap the weather line under " +
        "the household name on the Overview page to set one.",
      inputSchema: z.object({
        enabled: z.boolean().describe("true to turn the daily weather/what-to-wear reminder on, false to turn it off."),
      }),
      execute: async ({ enabled }) => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return { error: "Not signed in." };

        const { error } = await supabase.from("notification_preferences").upsert(
          {
            user_id: user.id,
            household_id: householdId,
            domain_key: "weather",
            event_type: "daily_summary",
            channel: "push",
            enabled,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,domain_key,event_type" }
        );
        if (error) return { error: error.message };

        const { data: household } = await supabase.from("households").select("latitude, longitude").eq("id", householdId).maybeSingle();
        const locationSet = !!household && household.latitude !== null && household.longitude !== null;

        return { enabled, locationSet };
      },
    }),
  };
}

type HouseholdLocationMatch<T> = { kind: "none" } | { kind: "ambiguous"; candidates: T[] } | { kind: "found"; location: T };

/**
 * Matches a freeform question phrase (e.g. "kitchen", "the garage") to one
 * of the household's real Locations, via the same matchByName policy
 * lib/reference/starter-inventory.ts's matchReferenceLocation is built on
 * (case-insensitive exact match first, then substring containment either
 * direction) — but unlike that function's fixed, non-colliding 22-name
 * list, a household's own Locations are arbitrary and user-named, so more
 * than one can genuinely match the same freeform phrase (e.g. "Garage" and
 * "Garage Loft" both matching "garage"). Silently picking the first one in
 * that case would let the tool confidently answer about the wrong
 * Location, so this returns an explicit "ambiguous" result instead — never
 * a guess.
 */
function matchHouseholdLocation<T extends { name: string }>(locations: T[], query: string): HouseholdLocationMatch<T> {
  const matches = matchByName(locations, (l) => l.name, query);
  if (matches.length === 0) return { kind: "none" };
  if (matches.length === 1) return { kind: "found", location: matches[0] };
  return { kind: "ambiguous", candidates: matches };
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
