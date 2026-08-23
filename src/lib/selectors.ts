import type { Account, AccountType, ActivityLogEntry, Container, FinanceCategory, Item, Location, RecurringBill, Tag, Transaction } from "./types";

/**
 * The full tag-style category set for one transaction (Categories
 * Foundation workstream) — `taggedCategoryIds` should already be just
 * this transaction's own transaction_categories rows, not the whole
 * household's. A caller rendering many transactions at once should group
 * transaction_categories into a `Record<transactionId, categoryId[]>`
 * once (e.g. via useMemo) and look up each row's slice from that, the
 * same way the transactions list page already groups scanned receipt
 * line items — not filter the full array again per row.
 *
 * Falls back to the transaction's single legacy `categoryId` only when no
 * tag rows exist for it yet (predates the junction table, or a creation
 * path that only ever set categoryId) — never shows both, never shows
 * empty when a real primary category is set. Previously three near-
 * identical copies of this same fallback logic (the transactions list,
 * the detail sheet, and the edit form) — one shared function now, so
 * "what categories does this transaction show" can't drift between them.
 */
export function categoriesForTransaction(
  transaction: Pick<Transaction, "categoryId">,
  taggedCategoryIds: string[],
  financeCategories: FinanceCategory[]
): FinanceCategory[] {
  const tagged = taggedCategoryIds.map((id) => financeCategories.find((c) => c.id === id)).filter((c): c is FinanceCategory => !!c);
  if (tagged.length > 0) return tagged;
  const primary = transaction.categoryId ? financeCategories.find((c) => c.id === transaction.categoryId) : undefined;
  return primary ? [primary] : [];
}

/** Case-insensitive alphabetical sort by whatever label a caller extracts — the shared ordering every dropdown of accounts/categories/members/etc. should use instead of rendering the raw store/DB order (usually creation order, not remotely alphabetical, and different again after every edit). Copies rather than sorting in place — callers almost always feed this a store array directly. */
export function sortByLabel<T>(items: T[], getLabel: (item: T) => string): T[] {
  return [...items].sort((a, b) => getLabel(a).localeCompare(getLabel(b), undefined, { sensitivity: "base" }));
}

export type WarrantyStatus = "active" | "expired" | "unknown";

/**
 * One shared classification for an item's `extraDetails.warrantyEnd`
 * (freeform text, no format enforced at capture) — used by both
 * item-purchase-section.tsx's UI badge and the Ask assistant's
 * getItemPurchaseInfo tool, previously two separate copies of the same
 * date-parse-and-compare logic (Household Ledger Implementation Plan §9).
 * "unknown" for a missing or unparsable date, never "expired" — an
 * unparsable value stating a false fact ("coverage has lapsed") is worse
 * than admitting the date isn't tracked/understood.
 */
export function warrantyStatus(warrantyEndIso: string | null | undefined): WarrantyStatus {
  if (!warrantyEndIso) return "unknown";
  const end = new Date(warrantyEndIso).getTime();
  if (Number.isNaN(end)) return "unknown";
  return end >= Date.now() ? "active" : "expired";
}

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

/** A container qualifying as a "this looks like it belongs there instead" suggestion. */
export interface ContainerFitSuggestion {
  container: Container;
  matchingCount: number;
  totalCount: number;
}

// At least this many of a container's own items must share the new item's
// category before it's worth suggesting — one coincidental match isn't a
// real theme.
const MIN_MATCHING_ITEMS = 2;
// ...and that category has to be a clear majority of what's in there, not
// just present — a large mixed-bag container that happens to hold a
// couple of the same category shouldn't outrank a genuinely themed one.
const MIN_MATCH_RATIO = 0.5;

/**
 * When adding a new item, checks whether some OTHER existing container
 * already holds a clear majority of items in the same category — a signal
 * the household already has a themed container (e.g. a "Hand Tools" bin)
 * this new item probably belongs in too, rather than wherever it's about
 * to be filed. Assisted, not automatic, same posture as every AI/heuristic
 * suggestion elsewhere in this app: this only ever returns a candidate for
 * the UI to show and the user to accept or ignore, never moves anything on
 * its own.
 *
 * "Miscellaneous" is deliberately excluded — it's this app's catch-all
 * category (lib/types.ts's CATEGORIES), not a real theme, so two
 * containers both holding some "Miscellaneous" items isn't a meaningful
 * signal worth surfacing.
 *
 * Household-wide, not scoped to the current Location — the point is
 * specifically to catch "you already have a Tools container, just not in
 * the Location you're adding to right now," not just containers nearby.
 * `currentContainerId` (the destination already selected, if any) is
 * always excluded from consideration — there's nothing to suggest if the
 * item's already headed somewhere with a matching theme.
 */
export function suggestBetterContainer(
  items: Item[],
  containers: Container[],
  category: string,
  currentContainerId: string | null
): ContainerFitSuggestion | null {
  if (category === "Miscellaneous") return null;

  let best: ContainerFitSuggestion | null = null;
  for (const container of containers) {
    if (container.status !== "active" || container.id === currentContainerId) continue;
    const containerItems = items.filter((it) => it.status === "active" && it.containerId === container.id);
    if (containerItems.length === 0) continue;
    const matchingCount = containerItems.filter((it) => it.category === category).length;
    if (matchingCount < MIN_MATCHING_ITEMS) continue;
    if (matchingCount / containerItems.length < MIN_MATCH_RATIO) continue;
    if (!best || matchingCount > best.matchingCount) {
      best = { container, matchingCount, totalCount: containerItems.length };
    }
  }
  return best;
}

export function collectDescendantIds(containers: Container[], rootId: string): string[] {
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

/** Active items with no Container — sitting directly in a Location, or (should be rare, but nothing used to catch it) with no Location either. The Dashboard "Action queue" Loose count; links to /unassigned, which lists the same set. */
export function looseItemCount(items: Item[]): number {
  return items.filter((it) => it.status === "active" && it.containerId === null).length;
}

/** Active items still on the generic placeholder photo emoji — the Dashboard "Action queue" Photos count. */
export function genericPhotoItemCount(items: Item[]): number {
  return items.filter((it) => it.status === "active" && it.photoEmoji === "📦").length;
}

export interface ContainerStatusFlags {
  needsReview: boolean;
  genericPhoto: boolean;
}

/** Rolls up whether any item within a container (including sub-containers) needs review or still has a generic photo. */
export function containerStatusFlags(items: Item[], containers: Container[], containerId: string): ContainerStatusFlags {
  const ids = new Set([containerId, ...collectDescendantIds(containers, containerId)]);
  const inContainer = items.filter((it) => it.status === "active" && it.containerId && ids.has(it.containerId));
  return {
    needsReview: inContainer.some((it) => it.needsReview),
    genericPhoto: inContainer.some((it) => it.photoEmoji === "📦"),
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

/**
 * Overview page's notification-bell badge (`members.last_activity_viewed_at`,
 * 0025_activity_last_viewed.sql). `null` lastViewedAt means the current
 * member has never opened /activity — every row counts as unread rather
 * than none, since defaulting to "caught up" would silently hide a
 * brand-new member's entire backlog. The caller's own actions are
 * excluded: you already know what you just did, so it never counts
 * against your own badge.
 */
export function unreadActivityCount(activity: ActivityLogEntry[], currentUserId: string, lastViewedAt: string | null): number {
  // Date.getTime(), not a raw string compare — this file's other
  // timestamp comparisons (transactionsForAccount, recentTransactions,
  // upcomingRecurringBills, all above) deliberately avoid string
  // comparison for exactly this reason: lastViewedAt is stamped
  // client-side via nowIso()'s "Z"-suffixed toISOString(), but
  // activity[].createdAt round-trips through Supabase/PostgREST, which
  // can come back with a "+00:00"-style offset and/or different
  // fractional-second precision. Two differently-formatted ISO strings
  // don't sort the same as their real chronological order at that
  // boundary — a raw ">" here could silently mark read activity as
  // unread or vice versa.
  const watermark = lastViewedAt ? new Date(lastViewedAt).getTime() : null;
  return activity.filter((a) => a.actorUserId !== currentUserId && (watermark === null || new Date(a.createdAt).getTime() > watermark)).length;
}

/**
 * The global Scan button (bottom-nav FAB, desktop sidebar) used to always
 * link to a bare `/capture`, which falls back to whatever `lastUsedDestination`
 * happened to be — often a different room/container than whichever one is
 * currently open. Deriving the destination from the current route instead
 * means "scan while viewing a Location/Container" actually adds items there.
 */
export function contextualCaptureHref(pathname: string, containers: Container[]): string {
  const locationMatch = pathname.match(/^\/locations\/([^/]+)/);
  if (locationMatch) return `/capture?locationId=${locationMatch[1]}`;

  const containerMatch = pathname.match(/^\/containers\/([^/]+)/);
  if (containerMatch) {
    const container = containers.find((c) => c.id === containerMatch[1]);
    if (container) return `/capture?locationId=${container.locationId}&containerId=${container.id}`;
  }

  return "/capture";
}

export function daysUntil(dateIso: string): number {
  const diff = new Date(dateIso).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

// ---------------------------------------------------------------------------
// Finance domain (docs/Personal Finance PRD.md §13 Dashboard Requirements).
// No visibility filtering happens here — RLS already scoped `accounts`/
// `transactions`/`recurringBills` in the store to what the caller can see
// (Personal Finance Addendum, "Privacy model") before these selectors ever
// run; they only decide *ordering/grouping* of an already-correct set.
// ---------------------------------------------------------------------------

export function activeAccounts(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.status === "active");
}

const ACCOUNT_TYPE_GROUP: Record<AccountType, string> = {
  checking: "Checking & Savings",
  savings: "Checking & Savings",
  credit_card: "Credit Cards",
  cash: "Checking & Savings",
  loan: "Loans & Mortgage",
  mortgage: "Loans & Mortgage",
  investment: "Investment",
};

const ACCOUNT_GROUP_ORDER = ["Checking & Savings", "Credit Cards", "Loans & Mortgage", "Investment"];

export interface AccountGroup {
  label: string;
  accounts: Account[];
}

/** Groups active accounts the same way the Accounts List screen does (PRD §35) — Checking & Savings, Credit Cards, Loans & Mortgage, Investment, in that fixed order, empty groups omitted. */
export function groupAccountsByType(accounts: Account[]): AccountGroup[] {
  const active = activeAccounts(accounts);
  return ACCOUNT_GROUP_ORDER.map((label) => ({
    label,
    accounts: active.filter((a) => ACCOUNT_TYPE_GROUP[a.type] === label),
  })).filter((g) => g.accounts.length > 0);
}

/** Sum of every active account's current balance. Liability accounts (credit_card/loan/mortgage) already carry a negative current_balance once they have any spend on them, so this is a plain sum, not assets-minus-liabilities computed separately. */
export function netWorth(accounts: Account[]): number {
  return activeAccounts(accounts).reduce((sum, a) => sum + a.currentBalance, 0);
}

export interface CashFlow {
  income: number;
  spend: number;
  net: number;
}

/** Income vs. expense for the given month (year/month from a Date, local time). Transfers/payments are deliberately excluded — moving money between your own accounts isn't income or spend, just a shuffle (PRD §15). */
export function cashFlowForMonth(transactions: Transaction[], month: Date): CashFlow {
  const y = month.getFullYear();
  const m = month.getMonth();
  const inMonth = transactions.filter((t) => {
    if (t.trashedAt || t.excludedFromReports) return false;
    const d = new Date(t.occurredAt);
    return d.getFullYear() === y && d.getMonth() === m;
  });
  const income = inMonth.filter((t) => t.type === "income").reduce((sum, t) => sum + t.amount, 0);
  const spend = inMonth.filter((t) => t.type === "expense").reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return { income, spend, net: income - spend };
}

export interface CashFlowMonth extends CashFlow {
  /** Short label for a chart axis, e.g. "Mar". */
  label: string;
  /** First-of-month Date this point represents — for a caller that needs more than the short label. */
  month: Date;
}

/** cashFlowForMonth() run over the last `monthsBack` months (this month included, oldest first) — the per-month income/expense series PRD §35's "Cash flow — income vs. expense, per month" chart needs, not just a single period's snapshot. */
export function cashFlowTrend(transactions: Transaction[], monthsBack: number, now: Date = new Date()): CashFlowMonth[] {
  const months: CashFlowMonth[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const month = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const flow = cashFlowForMonth(transactions, month);
    months.push({ ...flow, label: month.toLocaleDateString(undefined, { month: "short" }), month });
  }
  return months;
}

export interface CategorySpend {
  categoryId: string | null;
  name: string;
  amount: number;
}

/** Expense-only spend for the given month, grouped by category and ranked descending — PRD §35's "Category breakdown — ranked by spend" chart. Income/transfer/refund transactions don't count toward "spend" any more than they do in cashFlowForMonth above; a category with zero spend this month is simply omitted rather than shown as a zero-width bar. */
export function categoryBreakdownForMonth(transactions: Transaction[], categories: FinanceCategory[], month: Date, limit = 8): CategorySpend[] {
  const y = month.getFullYear();
  const m = month.getMonth();
  const nameById = new Map(categories.map((c) => [c.id, c.name]));

  const totals = new Map<string | null, number>();
  for (const t of transactions) {
    if (t.trashedAt || t.excludedFromReports || t.type !== "expense") continue;
    const d = new Date(t.occurredAt);
    if (d.getFullYear() !== y || d.getMonth() !== m) continue;
    const key = t.categoryId;
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(t.amount));
  }

  return Array.from(totals.entries())
    .map(([categoryId, amount]) => ({ categoryId, name: categoryId ? (nameById.get(categoryId) ?? "Uncategorized") : "Uncategorized", amount }))
    .filter((c) => c.amount > 0) // a $0 total (e.g. a receipt whose amount never got parsed) isn't meaningful as a spend-ranked bar
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** Active, non-trashed transactions for one account, most recent first. */
export function transactionsForAccount(transactions: Transaction[], accountId: string): Transaction[] {
  return transactions
    .filter((t) => t.accountId === accountId && !t.trashedAt)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
}

export function recentTransactions(transactions: Transaction[], limit: number): Transaction[] {
  return transactions
    .filter((t) => !t.trashedAt)
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
    .slice(0, limit);
}

/** Active (not paused, not trashed) recurring bills, soonest-due first. */
export function upcomingRecurringBills(bills: RecurringBill[], limit?: number): RecurringBill[] {
  const active = bills
    .filter((b) => b.isActive && !b.trashedAt)
    .sort((a, b) => new Date(a.nextDueDate).getTime() - new Date(b.nextDueDate).getTime());
  return limit ? active.slice(0, limit) : active;
}

const ACCOUNT_TYPE_ICON: Record<AccountType, "landmark" | "wallet" | "creditCard" | "cash" | "trendingUp"> = {
  checking: "landmark",
  savings: "wallet",
  credit_card: "creditCard",
  cash: "cash",
  loan: "landmark",
  mortgage: "landmark",
  investment: "trendingUp",
};

export function accountTypeIcon(type: AccountType) {
  return ACCOUNT_TYPE_ICON[type];
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking",
  savings: "Savings",
  credit_card: "Credit Card",
  cash: "Cash",
  loan: "Loan",
  mortgage: "Mortgage",
  investment: "Investment",
};

/** Types where currentBalance being negative *is* the correct, expected state — you owe on these, you don't hold a balance in them. netWorth() trusts every account's currentBalance is already signed correctly and just sums; the only place that sign can actually go wrong is user-entered input (starting balance), never transactions (their own amount sign is already correct per type — an expense is already negative). */
export const LIABILITY_ACCOUNT_TYPES: readonly AccountType[] = ["credit_card", "loan", "mortgage"];

/** Normalizes a user-entered balance magnitude against the account type it belongs to — a liability's starting balance always means "how much you owe," so it's always stored as a negative number regardless of the sign actually typed (a bare "5000" and a "-5000" both mean the same thing for a loan). Asset types are left exactly as entered, including negative (a checking account can be legitimately overdrawn). */
export function normalizeAccountBalance(type: AccountType, amount: number): number {
  return LIABILITY_ACCOUNT_TYPES.includes(type) ? -Math.abs(amount) : amount;
}

/** The inverse for display — an existing liability balance is stored negative; the form should still show it to the user as the positive "how much you owe" magnitude they'd naturally type. */
export function displayAccountBalanceMagnitude(type: AccountType, storedBalance: number): number {
  return LIABILITY_ACCOUNT_TYPES.includes(type) ? Math.abs(storedBalance) : storedBalance;
}
