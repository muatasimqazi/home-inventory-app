import { buildBreadcrumb, breadcrumbLabel, activeItemCountForContainer } from "./selectors";
import type { Account, Container, FinanceCategory, Item, Location, Note, ScannedReceiptLineItem, Tag, Transaction } from "./types";

// Weighted, token-based ranking, in the spirit of PRD §11 (typo-tolerant-ish,
// spans names/categories/tags/breadcrumbs, ranked). Adapted from the scoring
// approach already proven in the legacy Apps Script backend's
// searchInventory() — and now genuinely cross-domain, not inventory-only:
// Search sits in the most prominent nav slot in the app (one of 4
// bottom-nav tabs), and only ever searching Inventory while Finance
// silently didn't exist was a real, reported gap, not a stylistic choice.

export interface ItemSearchResult {
  kind: "item";
  score: number;
  item: Item;
  breadcrumbLabel: string;
}

export interface TransactionSearchResult {
  kind: "transaction";
  score: number;
  transaction: Transaction;
  /** Set when the match came from itemized receipt data rather than the transaction's own merchant/description/category — lets the result row say "Milk in this receipt" instead of just repeating the merchant name. */
  matchedItemName: string | null;
}

export interface AccountSearchResult {
  kind: "account";
  score: number;
  account: Account;
}

export interface ContainerSearchResult {
  kind: "container";
  score: number;
  container: Container;
  /** Path to this container's parent (Location, plus any parent containers) — same "where this lives" shape as ItemSearchResult's breadcrumbLabel, deliberately excluding the container's own name since that's already the result row's primary text. */
  breadcrumbLabel: string;
  itemCount: number;
}

export interface NoteSearchResult {
  kind: "note";
  score: number;
  note: Note;
}

export type SearchResult = ItemSearchResult | TransactionSearchResult | AccountSearchResult | ContainerSearchResult | NoteSearchResult;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= 2);
}

/** Every query word has to show up *somewhere* for a candidate to match at all — a query like "red mug" shouldn't surface a result that only contains "red", which plain per-token OR scoring alone would otherwise do. Shared by every searchX() below. */
function matchesAllTokens(searchable: string, queryTokens: string[]): boolean {
  return queryTokens.length === 0 || queryTokens.every((token) => searchable.includes(token));
}

export function searchInventory(query: string, items: Item[], containers: Container[], locations: Location[], tags: Tag[]): ItemSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryTokens = tokenize(q);

  return items
    .filter((it) => it.status === "active")
    .map((it) => {
      const breadcrumb = buildBreadcrumb(it.locationId, it.containerId, locations, containers);
      const breadcrumbText = breadcrumbLabel(breadcrumb).toLowerCase();
      const displayCode = (containers.find((c) => c.id === it.containerId)?.displayCode ?? "").toLowerCase();
      const tagNames = it.tagIds
        .map((tid) => tags.find((t) => t.id === tid)?.name ?? "")
        .join(" ")
        .toLowerCase();

      const name = it.name.toLowerCase();
      const original = (it.originalDetectedName ?? "").toLowerCase();
      const category = it.category.toLowerCase();
      const notes = it.notes.toLowerCase();

      const searchable = [name, original, category, notes, tagNames, breadcrumbText, displayCode].join(" ");

      let score = 0;
      if (matchesAllTokens(searchable, queryTokens)) {
        if (name === q) score += 100;
        if (name.includes(q)) score += 60;
        if (original.includes(q)) score += 45;
        if (category.includes(q)) score += 25;
        if (breadcrumbText.includes(q)) score += 30;
        if (displayCode && displayCode === q) score += 80;
        else if (displayCode.includes(q)) score += 40;
        if (tagNames.includes(q)) score += 30;
        if (notes.includes(q)) score += 10;

        for (const token of queryTokens) {
          if (name.includes(token)) score += 12;
          if (breadcrumbText.includes(token)) score += 8;
          if (searchable.includes(token)) score += 3;
        }
      }

      return { kind: "item" as const, item: it, score, breadcrumbLabel: breadcrumbLabel(breadcrumb) };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
}

/**
 * Notes by title or content — folded only into the "all" domain tab on
 * the Search page (v1 scope call, see 0050_notes.sql's planning doc: not
 * a full-fledged domain with its own filter chip yet), matching title
 * more heavily than a content-body hit.
 */
export function searchNotes(query: string, notes: Note[]): NoteSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryTokens = tokenize(q);

  return notes
    .filter((n) => n.status === "active")
    .map((n) => {
      const title = n.title.toLowerCase();
      const content = n.content.toLowerCase();
      const searchable = [title, content].join(" ");

      let score = 0;
      if (matchesAllTokens(searchable, queryTokens)) {
        if (title === q) score += 100;
        if (title.includes(q)) score += 60;
        if (content.includes(q)) score += 20;
        for (const token of queryTokens) {
          if (title.includes(token)) score += 12;
          if (searchable.includes(token)) score += 3;
        }
      }

      return { kind: "note" as const, note: n, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.note.title.localeCompare(b.note.title));
}

/**
 * Containers by name, description, Container ID, or where they live —
 * previously the only way a container's name surfaced in Search was
 * indirectly, as part of an *item's* breadcrumb (so a match there only
 * ever produced item results, never the container itself as a result you
 * could open). Same scoring shape as searchInventory above, just without
 * a tags dimension (containers don't carry tags, only items do).
 */
export function searchContainers(query: string, containers: Container[], locations: Location[], items: Item[]): ContainerSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryTokens = tokenize(q);

  return containers
    .filter((c) => c.status === "active")
    .map((c) => {
      // Path to this container's *parent* (location, plus any parent
      // containers) — buildBreadcrumb(locationId, containerId, ...) walks
      // down to and including `containerId`, so passing parentContainerId
      // here (not c.id) naturally excludes the container itself, same as
      // containers/[id]/page.tsx's own breadcrumb.slice(0, -1) does for
      // the same reason.
      const breadcrumb = buildBreadcrumb(c.locationId, c.parentContainerId ?? null, locations, containers);
      const breadcrumbText = breadcrumbLabel(breadcrumb).toLowerCase();

      const name = c.name.toLowerCase();
      const description = (c.description ?? "").toLowerCase();
      const displayCode = (c.displayCode ?? "").toLowerCase();

      const searchable = [name, description, displayCode, breadcrumbText].join(" ");

      let score = 0;
      if (matchesAllTokens(searchable, queryTokens)) {
        if (name === q) score += 100;
        if (name.includes(q)) score += 60;
        if (displayCode && displayCode === q) score += 80;
        else if (displayCode.includes(q)) score += 40;
        if (breadcrumbText.includes(q)) score += 30;
        if (description.includes(q)) score += 15;

        for (const token of queryTokens) {
          if (name.includes(token)) score += 12;
          if (breadcrumbText.includes(token)) score += 8;
          if (searchable.includes(token)) score += 3;
        }
      }

      return {
        kind: "container" as const,
        container: c,
        score,
        breadcrumbLabel: breadcrumbLabel(breadcrumb),
        itemCount: activeItemCountForContainer(items, containers, c.id),
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.container.name.localeCompare(b.container.name));
}

/**
 * Transactions + accounts. Recurring bills and categories are deliberately
 * not their own searchable result kind here — a category isn't really a
 * "thing you search for and open," it's an attribute results already match
 * against, and recurring bills have no per-bill detail page to link a
 * result to yet (just the /finance/recurring list).
 *
 * `lineItemsByTransaction` is optional and defaults to {} — Search works
 * fine (matching merchant/description/notes/category) even before/without
 * that bulk fetch landing; passing it in adds itemized-receipt-item
 * matching on top, the same "search 'milk', find the receipt" value the
 * Transactions list's own filter and the AI Q&A feature both already have.
 */
export function searchFinance(
  query: string,
  transactions: Transaction[],
  accounts: Account[],
  financeCategories: FinanceCategory[],
  lineItemsByTransaction: Record<string, ScannedReceiptLineItem[]> = {}
): (TransactionSearchResult | AccountSearchResult)[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const queryTokens = tokenize(q);

  const transactionResults: TransactionSearchResult[] = transactions
    .filter((t) => !t.trashedAt)
    .map((t) => {
      const merchant = (t.merchant ?? "").toLowerCase();
      const description = (t.description ?? "").toLowerCase();
      const notes = t.notes.toLowerCase();
      const category = (financeCategories.find((c) => c.id === t.categoryId)?.name ?? "").toLowerCase();
      const items = lineItemsByTransaction[t.id] ?? [];
      const itemSearchable = items.map((li) => `${li.standardName || li.rawItem} ${li.brand ?? ""}`.toLowerCase());
      const searchable = [merchant, description, notes, category, ...itemSearchable].join(" ");

      let score = 0;
      let matchedItemName: string | null = null;
      if (matchesAllTokens(searchable, queryTokens)) {
        if (merchant === q) score += 100;
        if (merchant.includes(q)) score += 60;
        if (description.includes(q)) score += 30;
        if (category.includes(q)) score += 20;
        if (notes.includes(q)) score += 10;

        const itemMatch = items.find((li) => `${li.standardName || li.rawItem} ${li.brand ?? ""}`.toLowerCase().includes(q));
        if (itemMatch) {
          score += 50;
          matchedItemName = itemMatch.standardName || itemMatch.rawItem;
        }

        for (const token of queryTokens) {
          if (merchant.includes(token)) score += 12;
          if (searchable.includes(token)) score += 3;
        }
      }

      return { kind: "transaction" as const, score, transaction: t, matchedItemName };
    })
    .filter((r) => r.score > 0);

  const accountResults: AccountSearchResult[] = accounts
    .filter((a) => a.status === "active")
    .map((a) => {
      const name = a.name.toLowerCase();
      const institution = (a.institutionName ?? "").toLowerCase();
      const cardLastFour = a.cardLastFour ?? "";
      const searchable = [name, institution, cardLastFour].join(" ");

      let score = 0;
      if (matchesAllTokens(searchable, queryTokens)) {
        if (name === q) score += 100;
        if (name.includes(q)) score += 60;
        if (institution.includes(q)) score += 30;
        if (cardLastFour && cardLastFour === q) score += 80;
        for (const token of queryTokens) {
          if (name.includes(token)) score += 12;
          if (searchable.includes(token)) score += 3;
        }
      }

      return { kind: "account" as const, score, account: a };
    })
    .filter((r) => r.score > 0);

  return [...transactionResults, ...accountResults];
}
