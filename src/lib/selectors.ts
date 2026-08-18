import type { Account, AccountType, Container, Item, Location, RecurringBill, Tag, Transaction } from "./types";

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
