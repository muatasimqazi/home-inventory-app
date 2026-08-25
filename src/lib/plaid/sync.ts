import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Transaction as PlaidTransaction, RemovedTransaction as PlaidRemovedTransaction } from "plaid";
import { getPlaidClient } from "./client";
import { newId } from "@/lib/id";
import { findDuplicateTransaction } from "@/lib/csv-import-resolution";
import { resolveCategory } from "@/lib/receipt-resolution";
import { transactionToInsertRow, rowToAccount, rowToTransaction, rowToCategoryRule, rowToFinanceCategory } from "@/lib/supabase/mappers";
import type { AccountRow, TransactionRow, CategoryRuleRow, FinanceCategoryRow } from "@/lib/supabase/mappers";
import { TRASH_RETENTION_DAYS } from "@/lib/types";
import type { Transaction } from "@/lib/types";
import { normalizeAccountBalance } from "@/lib/selectors";

/**
 * The single sync function every trigger in docs/Bank Sync Addendum.md §6
 * calls (webhook, manual "Sync now", nightly cron fallback, and the
 * initial post-link sync) — never /transactions/get, the older
 * re-fetch-everything endpoint. Runs on the admin client throughout: no
 * signed-in user exists for a webhook or cron trigger, same trust
 * boundary as the Resend inbound-email webhook.
 */
export interface PlaidItemForSync {
  id: string;
  household_id: string;
  plaid_item_id: string;
  access_token: string;
  cursor: string | null;
  created_by_user_id: string;
}

export interface SyncResult {
  ok: boolean;
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
  error?: string;
}

function purgeAfter(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
  return d.toISOString();
}

/** Plaid: positive = money leaving the account, negative = money entering — the opposite of Shohaz's own signed-amount convention (negative = money out). */
function toShohazAmount(plaidAmount: number): number {
  return -plaidAmount;
}

/**
 * Real bug, found investigating "net worth and cash flow both read too
 * high": every Plaid-synced transaction was typed by sign alone
 * (amount < 0 ? "expense" : "income"), same as a plain manual entry. But
 * sign alone can't tell a real deposit apart from a credit-card/loan
 * payment landing as a positive "credit" on that account — Plaid reports
 * both the same way. So every synced card/loan payment was quietly
 * counted as *income*, on top of the matching *expense* Plaid already
 * reports on the paying account — cashFlowForMonth (selectors.ts)
 * deliberately excludes "transfer"/"payment" from income/spend for
 * exactly this reason (moving money between your own accounts isn't
 * real income or spend), but nothing here was ever giving it that type
 * to exclude. Net worth stayed numerically correct despite this — see
 * the balance-reconciliation loop below, which forces each account's
 * current_balance to match Plaid's own reported balance every sync,
 * independent of any one transaction's type — but cash flow has no
 * equivalent self-correction; it sums the raw monthly rows directly.
 *
 * personal_finance_category is Plaid's own confidence-scored
 * classification of intent — the right signal for this, rather than
 * guessing from merchant text the way findDuplicateTransaction does for
 * a different problem. LOAN_PAYMENTS is specifically credit-card/loan/
 * mortgage payments; TRANSFER_IN/TRANSFER_OUT is general account-to-
 * account movement (e.g. checking <-> savings) — mapped to "payment" and
 * "transfer" respectively to match how a manually-entered linked pair
 * (createLinkedTransactionPair) already distinguishes the two, though
 * every selector that excludes one from cash flow/categorization
 * excludes both identically today.
 */
function plaidTransactionType(pt: PlaidTransaction, signedAmount: number): Transaction["type"] {
  switch (pt.personal_finance_category?.primary) {
    case "LOAN_PAYMENTS":
      return "payment";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
      return "transfer";
    default:
      return signedAmount < 0 ? "expense" : "income";
  }
}

function merchantAndDescription(pt: PlaidTransaction): { merchant: string | null; description: string | null } {
  const merchant = pt.merchant_name || pt.name || null;
  const description = pt.merchant_name && pt.name && pt.merchant_name !== pt.name ? pt.name : null;
  return { merchant, description };
}

async function handleAdded(
  admin: SupabaseClient,
  householdId: string,
  createdByUserId: string,
  accountId: string,
  pt: PlaidTransaction,
  existingTxns: Transaction[],
  categoryRules: ReturnType<typeof rowToCategoryRule>[],
  categories: ReturnType<typeof rowToFinanceCategory>[]
): Promise<Transaction | null> {
  const amount = toShohazAmount(pt.amount);
  const occurredAt = pt.date;
  const { merchant, description } = merchantAndDescription(pt);

  // Pending -> posted reconciliation (Addendum §6): the final posted
  // transaction arrives as `added` with pending_transaction_id pointing
  // at the pending row already stored under that id — update it in
  // place so anything the household already touched (category, notes)
  // survives, instead of inserting a second row and losing it.
  if (pt.pending_transaction_id) {
    const pendingMatch = existingTxns.find((t) => t.plaidTransactionId === pt.pending_transaction_id);
    if (pendingMatch) {
      const patch: Partial<TransactionRow> = {
        plaid_transaction_id: pt.transaction_id,
        amount,
        occurred_at: occurredAt,
        posted_at: pt.pending ? null : occurredAt,
        status: pt.pending ? "pending" : "posted",
        // Always refreshed, not gated behind !pendingMatch.userEdited below
        // — unlike merchant/description/type, there's no UI for a
        // household to hand-edit this, so it's purely Plaid-derived and
        // safe to keep in sync the same way amount/occurred_at/status are.
        merchant_logo_url: pt.logo_url ?? null,
        updated_at: new Date().toISOString(),
      };
      if (!pendingMatch.userEdited) {
        patch.merchant = merchant;
        patch.description = description;
        patch.type = plaidTransactionType(pt, amount);
      }
      await admin.from("transactions").update(patch).eq("id", pendingMatch.id);
      return null; // reconciled onto an existing row, not a new one
    }
  }

  // Real bug, found live in production: an *exact* plaid_transaction_id
  // match was never checked before falling through to the fuzzy
  // findDuplicateTransaction heuristic below — if Plaid re-serves a
  // transaction_id we've already stored (a cursor edge case, two sync
  // runs overlapping) and its merchant/date has drifted enough to miss
  // the fuzzy amount/date-window/description-similarity match, this fell
  // straight through to a plain insert(), which the DB's own unique
  // constraint on plaid_transaction_id then correctly rejected — but as
  // a raw, unhandled Postgres error, not the graceful "already have
  // this one" no-op every other duplicate path here gets. Checking the
  // exact id first is both cheaper (skip the fuzzy scan entirely when we
  // already have the real key) and strictly more correct — an identical
  // external id is never ambiguous the way a fuzzy match can be.
  if (existingTxns.some((t) => t.plaidTransactionId === pt.transaction_id)) {
    return null;
  }

  // Same duplicate-detection heuristic CSV import uses (Addendum §2) —
  // one story across every import path. A match gets *adopted*
  // (plaid_transaction_id set, original source preserved) instead of
  // creating a second row for the same real-world charge.
  const duplicate = findDuplicateTransaction({ accountId, amount, occurredAt, description: merchant ?? "" }, existingTxns);
  if (duplicate) {
    await admin.from("transactions").update({ plaid_transaction_id: pt.transaction_id, merchant_logo_url: pt.logo_url ?? null }).eq("id", duplicate.id);
    return null;
  }

  // Plaid's own personal_finance_category isn't used here — merchant name
  // runs through the same resolveCategory() rule-then-guess resolution
  // every other import path uses (manual entry, receipt scanning), so a
  // rule taught anywhere applies everywhere. Only the rule-match branch
  // will typically resolve for a bank-fed merchant string; that's fine —
  // an unresolved category still posts (Plaid transactions are
  // bank-confirmed, not AI guesses needing review), same as any other
  // uncategorized transaction.
  const category = resolveCategory(merchant ?? "", "merchant", categoryRules, categories);

  const timestamp = new Date().toISOString();
  const created: Transaction = {
    id: newId(),
    householdId,
    accountId,
    occurredAt,
    postedAt: pt.pending ? null : occurredAt,
    amount,
    type: plaidTransactionType(pt, amount),
    categoryId: category.categoryId,
    merchant,
    description,
    notes: "",
    status: pt.pending ? "pending" : "posted",
    excludedFromReports: false,
    linkedTransactionId: null,
    source: "plaid",
    importBatchId: null,
    createdByUserId,
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: null,
    permanentlyDeleteAfter: null,
    plaidTransactionId: pt.transaction_id,
    userEdited: false,
    merchantLogoUrl: pt.logo_url ?? null,
  };
  const { error: insertError } = await admin.from("transactions").insert(transactionToInsertRow(created));
  if (insertError) {
    // 23505 = unique_violation. The exact-id and fuzzy checks above cover
    // every duplicate this function can see in its own in-memory
    // existingTxns snapshot, but two genuinely concurrent sync runs for
    // the same item (a manual "sync now" landing mid-cron, say) each read
    // that snapshot before the other's insert commits — a real race
    // neither in-memory check can catch. Treating a unique-violation
    // specifically as "someone else already inserted this one" rather
    // than a hard failure keeps that scenario a benign no-op instead of
    // an unhandled raw Postgres error (confirmed live: this used to
    // surface exactly that way). Any other error is a genuine failure —
    // logged and skipped, not thrown, so one bad row in a page doesn't
    // abort the rest of the sync.
    if (insertError.code !== "23505") {
      console.error(`syncPlaidItem: couldn't insert transaction ${pt.transaction_id}:`, insertError);
    }
    return null;
  }
  return created;
}

async function handleModified(admin: SupabaseClient, accountId: string, pt: PlaidTransaction): Promise<void> {
  const { data: existingRow } = await admin.from("transactions").select("*").eq("plaid_transaction_id", pt.transaction_id).maybeSingle();
  if (!existingRow) return; // nothing to reconcile against — not an error, just nothing to do
  const existing = rowToTransaction(existingRow as TransactionRow);

  const amount = toShohazAmount(pt.amount);
  const occurredAt = pt.date;
  const patch: Partial<TransactionRow> = {
    account_id: accountId,
    amount,
    occurred_at: occurredAt,
    posted_at: pt.pending ? null : occurredAt,
    status: pt.pending ? "pending" : "posted",
    merchant_logo_url: pt.logo_url ?? null,
    updated_at: new Date().toISOString(),
  };
  // Addendum §7 — once a human has edited category/merchant/description/
  // notes, a later refresh leaves those fields alone; only bank-confirmed
  // amount/date/status keep updating.
  if (!existing.userEdited) {
    const { merchant, description } = merchantAndDescription(pt);
    patch.merchant = merchant;
    patch.description = description;
    patch.type = plaidTransactionType(pt, amount);
  }
  await admin.from("transactions").update(patch).eq("id", existing.id);
}

async function handleRemoved(admin: SupabaseClient, rt: PlaidRemovedTransaction): Promise<void> {
  const { data: existingRow } = await admin.from("transactions").select("id").eq("plaid_transaction_id", rt.transaction_id).maybeSingle();
  if (!existingRow) return;
  const now = new Date();
  await admin
    .from("transactions")
    .update({ trashed_at: now.toISOString(), permanently_delete_after: purgeAfter(now) })
    .eq("id", existingRow.id);
}

function extractPlaidErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { error_code?: string } } }).response;
    return response?.data?.error_code ?? null;
  }
  return null;
}

export async function syncPlaidItem(admin: SupabaseClient, item: PlaidItemForSync): Promise<SyncResult> {
  const plaidClient = getPlaidClient();

  const [{ data: accountRows }, { data: ruleRows }, { data: categoryRows }] = await Promise.all([
    admin.from("accounts").select("*").eq("household_id", item.household_id),
    admin.from("category_rules").select("*").eq("household_id", item.household_id),
    admin.from("categories").select("*").eq("household_id", item.household_id),
  ]);
  const plaidLinkedAccounts = ((accountRows ?? []) as AccountRow[]).filter((r) => r.plaid_account_id).map(rowToAccount);
  const accountsByPlaidId = new Map(plaidLinkedAccounts.map((a) => [a.plaidAccountId as string, a]));
  const accountsById = new Map(plaidLinkedAccounts.map((a) => [a.id, a]));
  const categoryRules = ((ruleRows ?? []) as CategoryRuleRow[]).map(rowToCategoryRule);
  const categories = ((categoryRows ?? []) as FinanceCategoryRow[]).map(rowToFinanceCategory);

  let cursor = item.cursor ?? undefined;
  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;
  // Every /transactions/sync response includes each touched account's
  // current balance for free — captured from whichever page mentions an
  // account last, then reconciled onto accounts.starting_balance once the
  // whole item finishes syncing (below). Keyed by our own account id, not
  // Plaid's, so it survives straight into the reconciliation loop.
  const latestBalanceByAccountId = new Map<string, number>();

  try {
    let hasMore = true;
    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: item.access_token,
        cursor,
      });
      const { added, modified, removed, next_cursor, has_more, accounts: plaidAccounts } = response.data;

      for (const pa of plaidAccounts) {
        const account = accountsByPlaidId.get(pa.account_id);
        if (account && pa.balances.current !== null) latestBalanceByAccountId.set(account.id, pa.balances.current);
      }

      // Re-fetched per page (not just once up front) — an earlier page in
      // this same loop may have inserted/adopted rows a later page's
      // dedup check against the same account needs to see.
      const touchedAccountIds = [...new Set([...added, ...modified].map((t) => accountsByPlaidId.get(t.account_id)?.id).filter((id): id is string => Boolean(id)))];
      const { data: existingRows } = touchedAccountIds.length
        ? await admin.from("transactions").select("*").in("account_id", touchedAccountIds).is("trashed_at", null)
        : { data: [] as TransactionRow[] };
      const existingTxns = ((existingRows ?? []) as TransactionRow[]).map(rowToTransaction);

      for (const pt of added) {
        const account = accountsByPlaidId.get(pt.account_id);
        if (!account) continue; // Plaid account not mapped to a Shohaz account yet — shouldn't happen post-link, skip defensively rather than throw
        const created = await handleAdded(admin, item.household_id, item.created_by_user_id, account.id, pt, existingTxns, categoryRules, categories);
        if (created) existingTxns.push(created); // visible to this same page's later dedup checks
        addedCount++;
      }
      for (const pt of modified) {
        const account = accountsByPlaidId.get(pt.account_id);
        if (!account) continue;
        await handleModified(admin, account.id, pt);
        modifiedCount++;
      }
      for (const rt of removed) {
        await handleRemoved(admin, rt);
        removedCount++;
      }

      cursor = next_cursor;
      hasMore = has_more;
    }

    // Reconcile accounts.starting_balance so the balance trigger's
    // starting_balance + Σ(transactions) lines up with what Plaid reports
    // as the real current balance — this is what makes a freshly-linked
    // account (which starts with zero synced transactions) show the right
    // balance immediately, and keeps it self-correcting sync over sync
    // for anything transactions/sync doesn't fully capture as line items
    // (fees, interest, institution-side adjustments). This intentionally
    // repurposes starting_balance's meaning for a Plaid-linked account —
    // "the balance when this account was opened" only holds for a manual
    // account; here it's a plug figure recomputed every sync, the same
    // role a reconciling entry plays in real bookkeeping.
    for (const [accountId, plaidBalance] of latestBalanceByAccountId) {
      const account = accountsById.get(accountId);
      if (!account) continue;
      const { data: sumRows } = await admin.from("transactions").select("amount").eq("account_id", accountId).is("trashed_at", null);
      const txnSum = ((sumRows ?? []) as { amount: number }[]).reduce((total, r) => total + r.amount, 0);
      const normalizedBalance = normalizeAccountBalance(account.type, plaidBalance);
      await admin.from("accounts").update({ starting_balance: normalizedBalance - txnSum }).eq("id", accountId);
    }

    await admin
      .from("plaid_items")
      .update({ cursor, status: "active", error_code: null, last_synced_at: new Date().toISOString() })
      .eq("id", item.id);
    return { ok: true, addedCount, modifiedCount, removedCount };
  } catch (error) {
    const errorCode = extractPlaidErrorCode(error);
    const status = errorCode === "ITEM_LOGIN_REQUIRED" ? "reauth_required" : "error";
    await admin.from("plaid_items").update({ status, error_code: errorCode ?? "unknown_error" }).eq("id", item.id);
    console.error(`syncPlaidItem failed for item ${item.id}:`, error);
    return { ok: false, addedCount, modifiedCount, removedCount, error: errorCode ?? String(error) };
  }
}
