"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "./supabase/client";
import { newId, tagToken } from "./id";
import { isDisplayCodeTaken, nextDisplayCode, normalizeDisplayCode } from "./display-code";
import { ATTACHMENT_MAX_SIZE_BYTES, ATTACHMENT_MAX_SIZE_LABEL, isAttachmentTypeAllowed } from "./attachment-limits";
import { normalizeUploadedPhoto } from "./crop-image";
import { normalizeAccountBalance, buildBreadcrumb, breadcrumbLabel, advanceTaskDueDate } from "./selectors";
import {
  rowToHousehold,
  rowToMember,
  rowToInvite,
  inviteToInsertRow,
  rowToApiKey,
  rowToPerson,
  personToInsertRow,
  rowToLocation,
  locationToInsertRow,
  rowToContainer,
  containerToInsertRow,
  rowToItem,
  itemToInsertRow,
  rowToTag,
  tagToInsertRow,
  rowToNote,
  noteToInsertRow,
  rowToHouseholdTask,
  householdTaskToInsertRow,
  rowToTaskCompletion,
  taskCompletionToInsertRow,
  rowToTaskCategory,
  taskCategoryToInsertRow,
  rowToTaskSubtask,
  taskSubtaskToInsertRow,
  rowToFavorite,
  rowToActivityLogEntry,
  activityLogEntryToInsertRow,
  rowToAttachment,
  rowToItemDocumentLink,
  itemDocumentLinkToInsertRow,
  attachmentToInsertRow,
  rowToItemStudioPhoto,
  rowToPinnedLocation,
  pinnedLocationToInsertRow,
  rowToLabelBatch,
  labelBatchToInsertRow,
  rowToLabelBatchEntry,
  labelBatchEntryToInsertRow,
  rowToNormalizationRule,
  normalizationRuleToInsertRow,
  rowToAccount,
  accountToInsertRow,
  rowToFinanceAccountShare,
  financeAccountShareToInsertRow,
  rowToFinanceCategory,
  financeCategoryToInsertRow,
  rowToCategoryRule,
  categoryRuleToInsertRow,
  rowToCategoryBudget,
  categoryBudgetToInsertRow,
  rowToFinanceSettings,
  financeSettingsToInsertRow,
  rowToTransaction,
  transactionToInsertRow,
  rowToRecurringBill,
  recurringBillToInsertRow,
  rowToFinanceBillShare,
  financeBillShareToInsertRow,
  rowToRecurringCandidateDismissal,
  recurringCandidateDismissalToInsertRow,
  rowToAccountBalanceSnapshot,
  accountBalanceSnapshotToInsertRow,
  rowToCreditCardLiability,
  rowToTransactionAttachment,
  transactionAttachmentToInsertRow,
  rowToTransactionCategory,
  transactionCategoryToInsertRow,
  rowToItemPurchase,
  itemPurchaseToInsertRow,
  csvImportBatchToInsertRow,
  type TransactionAttachmentRow,
  type TransactionCategoryRow,
  type ItemPurchaseRow,
  type HouseholdRow,
  type MemberRow,
  type InviteRow,
  type ApiKeyRow,
  type PersonRow,
  type LocationRow,
  type ContainerRow,
  type ItemRow,
  type TagRow,
  type NoteRow,
  type HouseholdTaskRow,
  type TaskCompletionRow,
  type TaskCategoryRow,
  type TaskSubtaskRow,
  type FavoriteRow,
  type ActivityLogRow,
  type AttachmentRow,
  type ItemStudioPhotoRow,
  type ItemDocumentLinkRow,
  type PinnedLocationRow,
  type LabelBatchRow,
  type LabelBatchEntryRow,
  type NormalizationRuleRow,
  type AccountRow,
  type FinanceAccountShareRow,
  type FinanceCategoryRow,
  type CategoryRuleRow,
  type CategoryBudgetRow,
  type FinanceSettingsRow,
  type TransactionRow,
  type RecurringBillRow,
  type FinanceBillShareRow,
  type AccountBalanceSnapshotRow,
  type CreditCardLiabilityRow,
  type RecurringCandidateDismissalRow,
} from "./supabase/mappers";
import type {
  Account,
  AccountBalanceSnapshot,
  AccountType,
  CreditCardLiability,
  ActivityAction,
  ActivityEntityType,
  ActivityLogEntry,
  Attachment,
  ItemStudioPhoto,
  ItemDocumentLink,
  AttachmentKind,
  CategoryRule,
  CategoryBudget,
  Container,
  Favorite,
  FinanceAccountShare,
  FinanceBillShare,
  FinanceCategory,
  FinanceSettings,
  Household,
  Invite,
  ApiKey,
  Item,
  LabelBatch,
  LabelBatchEntry,
  LabelPaperPreset,
  LabelToggle,
  Location,
  Member,
  NormalizationRule,
  Note,
  HouseholdTask,
  TaskCompletion,
  TaskCategoryRecord,
  TaskSubtask,
  TaskLinkedEntityType,
  TaskScheduleType,
  TaskRecurrenceRule,
  Person,
  PersonRelationship,
  PinnedLocation,
  PinnedLocationCategory,
  RecurringBill,
  RecurringBillFrequency,
  RecurringCandidateDismissal,
  Tag,
  Transaction,
  TransactionAttachment,
  TransactionCategory,
  TransactionType,
  CsvImportBatch,
  ItemPurchase,
  ItemPurchaseSource,
} from "./types";
import { TRASH_RETENTION_DAYS } from "./types";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

// Supabase-backed data layer — households, members, invites, locations,
// containers, items, tags, favorites, activity log, attachments, label
// batches, and normalization rules are all real rows (or, for
// attachments, real Storage objects) in the linked Supabase project
// (supabase/migrations/0001_init.sql, 0002_accept_invite_by_email.sql,
// 0003_attachments_storage.sql) — RLS enforces household scoping the same
// way it would for a direct API call.
//
// Mutations are optimistic: local state updates immediately (same instant
// UX the mock always had), the write is fired at Supabase in the
// background, and a failure reverts the optimistic change and toasts an
// error. The handful of actions whose result already gates UI right now —
// assignDisplayCode, acceptInvite, leaveHousehold, createHousehold,
// claimUnassignedLabel — need a real answer, not a guess, so they're
// properly async/awaited instead. addAttachment is also awaited: a file
// has to actually finish uploading before there's anything to show.

const REVIEW_LOW_CONFIDENCE = 0.75;

export interface NewItemInput {
  name: string;
  originalDetectedName?: string | null;
  category: string;
  quantity?: number;
  notes?: string;
  /** Omitted/empty (default) — usually AI-suggested at capture time (supabase/migrations/0034_item_description_value.sql). */
  description?: string;
  /** Omitted/null (default) = not estimated — usually AI-suggested at capture time. */
  estimatedValue?: number | null;
  photoEmoji: string;
  locationId: string | null;
  containerId: string | null;
  needsReview?: boolean;
  reviewReason?: string;
  tagIds?: string[];
  extraDetails?: Record<string, string>;
  /** null/omitted = shared household item, not owned by one person (PRD §9's "Household" default). */
  ownerPersonId?: string | null;
  /** Only meaningful alongside a set ownerPersonId. Omitted/false (default) = private to the owner. true = shared with the whole household. */
  isShared?: boolean;
  /** null/omitted (default) = not tracked, no low-stock alert (supabase/migrations/0032_low_stock_alerts.sql). */
  minQuantity?: number | null;
  /**
   * Already-uploaded Storage path for this item's cover photo — set by
   * callers that upload the photo themselves *before* creating the item
   * (the capture-review flow, via the exported uploadCoverPhotoFile) so the
   * insert row already carries the right cover_photo_path from the start.
   * Left unset by every other creation path (add/page.tsx's manual-entry
   * photo picker, the container wizard, etc.), which still create the item
   * first and call setItemCoverPhoto after — those don't have a photo to
   * upload until the destination row already exists to attach it to.
   */
  coverPhotoPath?: string | null;
  /**
   * Already-uploaded Storage path for a background-removed variant of the
   * cover photo — set by the capture-review flow alongside coverPhotoPath,
   * via removeItemBackgroundViaAPI. Omitted/null everywhere else (manual
   * entry, container wizard, etc. never had a detection crop to remove the
   * background from) (supabase/migrations/0047_item_background_removed_photo.sql).
   */
  backgroundRemovedPhotoPath?: string | null;
}

export interface NewPersonInput {
  displayName: string;
  relationship: PersonRelationship;
  /** Set only when creating a Person record for an already-authenticated member (e.g. the Phase 0 backfill path) — the normal "+ Add someone" flow (PRD §22) creates a managed profile (linkedUserId null) and links it later, if ever, via a real account-linking flow (not built in Wave 1 — see the Implementation Plan §9 open item). */
  linkedUserId?: string | null;
}

const QUANTITY_MIN = 0;
const QUANTITY_MAX = 9999;

function clampQuantity(value: number): number {
  return Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, Math.round(value)));
}

/**
 * Client-side mirror of sync_item_location()'s low-stock derivation
 * (supabase/migrations/0032_low_stock_alerts.sql) — the trigger is the
 * authoritative source (recomputes this on every server write regardless
 * of what a client sends), this exists purely so an optimistic update
 * shows "Running low" the same frame a quantity/minQuantity edit lands,
 * not just after the write round-trips back or a Realtime event arrives.
 * `wasLow` comes from the *previous* row so an unrelated edit while
 * already low doesn't reset the since-when timestamp — same "preserve
 * across incidental writes" behavior the trigger gives via OLD.
 */
function deriveLowStockSince(wasLow: boolean, previousSince: string | null, quantity: number, minQuantity: number | null, timestamp: string): string | null {
  if (minQuantity === null || quantity > minQuantity) return null;
  return wasLow ? previousSince : timestamp;
}

export interface NewAccountInput {
  name: string;
  type: AccountType;
  institutionName?: string | null;
  startingBalance?: number;
  availableBalance?: number | null;
  cardLastFour?: string | null;
  openedAt?: string | null;
  /** null/omitted = joint/household account, visible to everyone. Set = personal, private by default (Personal Finance Addendum, "Privacy model"). */
  ownerUserId?: string | null;
}

export interface NewTransactionInput {
  accountId: string;
  occurredAt: string;
  postedAt?: string | null;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  type: TransactionType;
  categoryId?: string | null;
  /** Full tag-style set of categories to attach via transaction_categories (Categories Foundation workstream) — categoryId above should be this list's first/primary entry (or null when empty), kept in sync by the caller (transaction-form-sheet.tsx) for backward compat with every call site that only reads categoryId. Omit entirely for a caller that hasn't been updated to the multi-category picker yet — createTransaction only touches transaction_categories when this is provided. */
  categoryIds?: string[];
  merchant?: string | null;
  description?: string | null;
  notes?: string;
  status?: "pending" | "posted";
  excludedFromReports?: boolean;
  linkedTransactionId?: string | null;
  source?: "manual" | "csv_import" | "receipt_scan";
  importBatchId?: string | null;
}

export interface NewRecurringBillInput {
  name: string;
  expectedAmount: number;
  frequency: RecurringBillFrequency;
  nextDueDate: string;
  categoryId?: string | null;
  accountId?: string | null;
  ownerUserId?: string | null;
  /** Explicit "this bill IS a payment toward a debt account's balance" — independent of accountId, which just means "charged to/paid from this account" (a subscription's accountId is routinely a credit card too). Defaults false; drives the Recurring Bills page's "Credit Cards & Loans" section and the same-day debt-payment push reminder. */
  isDebtPayment?: boolean;
}

interface InventoryState {
  /** Every household the current user belongs to. */
  households: Household[];
  /** Which household's data currently occupies the fields below. Empty string before hydration or if the user has none yet. */
  currentHouseholdId: string;
  members: Member[];
  invites: Invite[];
  /** Metadata only — never the secret itself, which is never stored anywhere after the one generation response. Owner-only per RLS; empty for any non-owner member. */
  apiKeys: ApiKey[];
  /** Household Ledger People (PRD §8/§9/§23) — every authenticated Member plus every managed profile. Ownership (Item.ownerPersonId) and the People list in Settings read from here, not `members`. */
  people: Person[];
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  /** Personal-or-shared household notes (0050_notes.sql) — RLS already returns only what the caller can see (their own personal notes + every shared note), same "RLS is the complete filter" guarantee as `accounts`. */
  notes: Note[];
  /** Household Tasks domain (0051_household_tasks.sql) — always-on, no household.xEnabled gate, same call as Notes. */
  tasks: HouseholdTask[];
  taskCompletions: TaskCompletion[];
  /** household_id null rows are shared system defaults (Maintenance/Appointment/Chore/Grocery/Other), same "RLS is the complete filter" shape as financeCategories. */
  taskCategories: TaskCategoryRecord[];
  subtasks: TaskSubtask[];
  normalizationRules: NormalizationRule[];
  activity: ActivityLogEntry[];
  favorites: Favorite[];
  attachments: Attachment[];
  /** AI-generated ecommerce-style product photos (docs/Wardrobe Inventory.md) — read-only from the client's perspective, written only by the generate-studio-photo server route (under the caller's own RLS grants, not admin). */
  itemStudioPhotos: ItemStudioPhoto[];
  /** AI-suggested manual/warranty links for Appliance items (0035_item_document_links.sql) — see ItemDocumentLink's own doc comment. */
  itemDocumentLinks: ItemDocumentLink[];
  /** Simple Home Map (PRD §29) — pinned critical locations (water shutoff, panel, etc.) plus renovation wall photos. Hydrated/Realtime-synced like every other per-household array above. */
  pinnedLocations: PinnedLocation[];
  labelBatches: LabelBatch[];
  labelBatchEntries: LabelBatchEntry[];
  // Finance domain (supabase/migrations/0010_finance_schema.sql) — RLS
  // already filters these to what the caller can see (joint accounts +
  // their own personal accounts + anything shared with them), so a
  // private account another member hasn't shared never even reaches this
  // array; no client-side visibility filtering needed on top of RLS.
  accounts: Account[];
  financeAccountShares: FinanceAccountShare[];
  transactions: Transaction[];
  financeCategories: FinanceCategory[];
  categoryRules: CategoryRule[];
  /** Budgeting v1 — a standing monthly $ target per category, household-wide like categoryRules above. */
  categoryBudgets: CategoryBudget[];
  /** Budgeting v2 — shared household planning settings (currently just the Zero-Based Budget Builder's target monthly income). Null until the household has ever set one — unlike every array field around it, this is a single nullable object, not a list (finance_settings has at most one row per household). */
  financeSettings: FinanceSettings | null;
  recurringBills: RecurringBill[];
  financeBillShares: FinanceBillShare[];
  /** AI recurring-bill detection dismissals (Workstream 4, supabase/migrations/0026_recurring_candidate_dismissals.sql) — which detected-but-not-yet-tracked merchant+account patterns a household member has already said "not recurring" to, so /finance/recurring/detected doesn't keep re-surfacing them every run. Privacy-scoped like transactions (RLS via the account's own can_view_account()). */
  recurringCandidateDismissals: RecurringCandidateDismissal[];
  /** No Realtime subscription (rarely changes, not needed for live sync) — fetched once at hydration like everything else. */
  accountBalanceSnapshots: AccountBalanceSnapshot[];
  /** Plaid Liabilities product data (APR, statement balance, minimum payment, due date) for credit_card accounts only — one row per account, Plaid-sourced, no manual-entry path. No household_id column (visibility inherited via account_id, same as account_balance_snapshots/transactions) — unlike that table, this one IS Realtime-bound (see subscribeRealtime), since the "Connect for interest rate info" reconnect flow needs a freshly-synced row to appear live. */
  creditCardLiabilities: CreditCardLiability[];
  /** Permanently-retained receipt images (docs/Receipt Scanning Addendum.md §6) — unlike receipt_scan_batches/scanned_transaction_drafts/scanned_receipt_line_items (review-stage only, fetched on-demand by receipt-scan-session-store.ts, not part of this bundle), attachments are real permanent records shown on Transaction Detail, so they hydrate here like everything else. */
  transactionAttachments: TransactionAttachment[];
  /** Tag-style multi-category links (Categories Foundation workstream, supabase/migrations/0024_transaction_categories.sql) — a transaction can carry several of these, each still representing its full amount (not split-transaction accounting). transactions.categoryId is kept in sync alongside this table (whichever category is selected first/primary), so every existing single-category call site (dashboards, budget math, category_rules, the Ask tool) keeps working unchanged. RLS is privacy-aware like transactions' own policy, so — like itemPurchases — this array is already the complete set the caller should see. */
  transactionCategories: TransactionCategory[];
  /** Item ↔ transaction links (0017_household_ledger_core.sql, PRD §25 "Physical Item ↔ Financial Transaction"). RLS is privacy-aware (a link into a private account's transaction is only visible to those who can see that account), so — like `accounts` — this array is already the complete set the caller should see, no client-side filtering needed. */
  itemPurchases: ItemPurchase[];
  currentUserId: string;
  currentUserEmail: string;
  lastUsedDestination: { locationId: string | null; containerId: string | null } | null;

  isHydrated: boolean;
  hydrationError: string | null;
  /** Fetches the real signed-in user's households/membership and the current household's full bundle. Safe to call more than once — no-ops once hydrated, shares an in-flight call. */
  hydrate: () => Promise<void>;
  /** Opens a Realtime channel scoped to `householdId`, replacing any existing one — so a change made on another device/tab shows up here without a reload. */
  subscribeRealtime: (householdId: string) => void;
  /** Tears down the current Realtime channel, if any. Called before sign-out so the socket doesn't linger past the session. */
  unsubscribeRealtime: () => void;

  // Items
  createItem: (input: NewItemInput) => Item;
  createItemsBatch: (inputs: NewItemInput[]) => Item[];
  updateItem: (itemId: string, patch: Partial<Item>) => void;
  moveItem: (itemId: string, dest: { locationId: string | null; containerId: string | null }) => void;
  archiveItem: (itemId: string) => void;
  unarchiveItem: (itemId: string) => void;
  trashItem: (itemId: string) => void;
  restoreItem: (itemId: string) => void;
  permanentlyDeleteItem: (itemId: string) => void;

  // Locations
  createLocation: (input: { name: string; description?: string; coverPhotoEmoji?: string }) => Location;
  updateLocation: (locationId: string, patch: Partial<Location>) => void;
  trashLocation: (locationId: string) => void;
  restoreLocation: (locationId: string) => void;
  permanentlyDeleteLocation: (locationId: string) => void;
  setLocationCoverPhoto: (locationId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  /** Generates a cover photo via AI (POST /api/v1/vision/generate-location-photo) from a room type ("Kitchen", "Pantry", "Wardrobe", ...) plus optional freeform detail, then points the location at it — same shape/guarantees as setLocationCoverPhoto, just a generated image in place of a chosen file. */
  generateLocationCoverPhoto: (locationId: string, input: { roomType: string; detail?: string }) => Promise<{ ok: boolean; error?: string }>;
  removeLocationCoverPhoto: (locationId: string) => void;

  // Containers
  createContainer: (input: {
    name: string;
    description?: string;
    locationId: string;
    parentContainerId?: string | null;
    coverPhotoEmoji?: string;
  }) => Container;
  updateContainer: (containerId: string, patch: Partial<Container>) => void;
  moveContainer: (containerId: string, dest: { locationId: string; parentContainerId: string | null }) => void;
  trashContainer: (containerId: string) => void;
  restoreContainer: (containerId: string) => void;
  permanentlyDeleteContainer: (containerId: string) => void;
  /** Assigns `code` if provided (validated for per-household uniqueness), otherwise generates the next code for the container's location. Real, awaited: uniqueness can only be answered by the database. */
  assignDisplayCode: (containerId: string, code?: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  /** Marks a container's NFC tag as linked — native write, or written by another device and read natively (iOS). */
  linkNfcTag: (containerId: string) => void;
  /** Clears a container's NFC link so a different physical tag can be written/linked to it. */
  unlinkNfcTag: (containerId: string) => void;
  setContainerCoverPhoto: (containerId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  removeContainerCoverPhoto: (containerId: string) => void;
  /** Uploads `file` to the public "item-photos" bucket and points the item at it, replacing any existing cover photo. Real, awaited: same reasoning as addAttachment. */
  setItemCoverPhoto: (itemId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  removeItemCoverPhoto: (itemId: string) => void;

  // Attachments — real Supabase Storage (private "attachments" bucket)
  /** Uploads `file` to Storage, then inserts the attachment row. Real, awaited: a File has to actually finish uploading before there's anything to show. */
  addAttachment: (itemId: string, input: {
    kind: AttachmentKind;
    file: File;
  }) => Promise<{ ok: boolean; error?: string; attachment?: Attachment }>;
  deleteAttachment: (attachmentId: string) => void;

  /**
   * Calls /api/v1/vision/suggest-appliance-documents with the item's own
   * manufacturer/modelNumber extraDetails, replaces any existing
   * item_document_links rows for this item with whatever the model
   * suggested (regenerating drops stale ones rather than accumulating
   * duplicates), and returns how many links it actually found — 0 is a
   * normal outcome (the model had nothing it was confident enough to
   * suggest), not an error.
   */
  findApplianceDocuments: (itemId: string) => Promise<{ ok: boolean; error?: string; count?: number }>;
  deleteItemDocumentLink: (linkId: string) => void;

  // Home Map (pinned locations) — real Supabase Storage (private
  // "attachments" bucket, same one Attachments uses — see PinnedLocation's
  // own doc comment for why). Photo upload is optional on every call:
  // "Simple records only" (PRD §29) — a pin is still a real, useful record
  // with just a name/category/note and no photo yet.
  /** Real, awaited: same reasoning as addAttachment — a photo (when provided) has to finish uploading before there's a row worth showing. */
  createPinnedLocation: (input: {
    name: string;
    category: PinnedLocationCategory;
    locationNote?: string | null;
    photoFile?: File | null;
  }) => Promise<{ ok: boolean; error?: string; pinnedLocation?: PinnedLocation }>;
  updatePinnedLocation: (
    pinnedLocationId: string,
    patch: { name?: string; category?: PinnedLocationCategory; locationNote?: string | null; photoFile?: File | null; removePhoto?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  deletePinnedLocation: (pinnedLocationId: string) => void;

  // Label batches
  createLabelBatch: (input: {
    paperPreset: LabelPaperPreset;
    toggle: LabelToggle;
    includeLocation: boolean;
    offsetX: number;
    offsetY: number;
    containerIds: string[];
    unassignedCount: number;
  }) => { batch: LabelBatch; entries: LabelBatchEntry[] };
  /** Adopts a preprinted/unassigned label's tagToken (and a fresh Container ID, if the container doesn't have one) onto an existing container. Real, awaited: "already assigned" can only be answered for real. */
  claimUnassignedLabel: (entryId: string, containerId: string) => Promise<{ ok: boolean; error?: string }>;
  /** Transitions a batch (and every one of its entries) to 'printed' — the actual "this physically went to the printer" moment, distinct from just exporting a PDF. */
  markLabelBatchPrinted: (batchId: string) => void;

  // Tags
  getOrCreateTag: (name: string) => Tag;

  // Notes (0050_notes.sql, personal-or-shared per-note toggle — see
  // docs/Platform Foundation Addendum.md §6 on stating a new domain's
  // privacy answer explicitly rather than assuming)
  createNote: (input: { title: string; content: string; isShared?: boolean }) => Note;
  updateNote: (noteId: string, patch: Partial<Pick<Note, "title" | "content" | "isShared" | "pinned">>) => void;
  trashNote: (noteId: string) => void;
  restoreNote: (noteId: string) => void;
  permanentlyDeleteNote: (noteId: string) => void;

  // Household Tasks (0051_household_tasks.sql, docs/Household Hub Addendum.md)
  createTask: (input: {
    title: string;
    description?: string;
    categoryId: string;
    linkedEntityType?: TaskLinkedEntityType | null;
    linkedEntityId?: string | null;
    assignedToPersonId?: string | null;
    scheduleType: TaskScheduleType;
    dueAt: string;
    recurrenceRule?: TaskRecurrenceRule | null;
  }) => HouseholdTask;
  updateTask: (
    taskId: string,
    patch: Partial<
      Pick<
        HouseholdTask,
        "title" | "description" | "categoryId" | "linkedEntityType" | "linkedEntityId" | "assignedToPersonId" | "scheduleType" | "dueAt" | "recurrenceRule" | "isActive"
      >
    >
  ) => void;
  /** Inserts a real task_completions row, then either deactivates (one_time) or advances dueAt by recurrenceRule (recurring) — unlike RecurringBill's "mark as paid" (pure in-place mutation, no history), this keeps a real log. */
  completeTask: (taskId: string, notes?: string) => void;
  trashTask: (taskId: string) => void;
  restoreTask: (taskId: string) => void;
  permanentlyDeleteTask: (taskId: string) => void;

  // Task Categories (0053_task_categories_and_subtasks.sql) — mirrors
  // getOrCreateTag exactly, the "type it, it exists" creation UX.
  getOrCreateTaskCategory: (name: string) => TaskCategoryRecord;

  // Subtasks (0053_task_categories_and_subtasks.sql) — no trash lifecycle,
  // see TaskSubtask's own doc comment in lib/types.ts.
  createSubtask: (taskId: string, title: string) => TaskSubtask;
  toggleSubtask: (subtaskId: string) => void;
  deleteSubtask: (subtaskId: string) => void;

  // Normalization
  findNormalizationRule: (rawName: string) => NormalizationRule | undefined;
  saveNormalizationRule: (rawPattern: string, canonicalName: string, category: string) => void;

  // Finance — Accounts (docs/Personal Finance PRD.md, Personal Finance Addendum.md "Privacy model")
  createAccount: (input: NewAccountInput) => Account;
  updateAccount: (accountId: string, patch: Partial<Account>) => void;
  trashAccount: (accountId: string) => void;
  restoreAccount: (accountId: string) => void;
  permanentlyDeleteAccount: (accountId: string) => void;
  /** Grants a household member access to a personal account. Owner-only per RLS — a non-owner call fails server-side and reverts. */
  shareAccount: (accountId: string, withUserId: string) => void;
  unshareAccount: (accountId: string, withUserId: string) => void;

  // Finance — Transactions
  createTransaction: (input: NewTransactionInput) => Transaction;
  /** Creates both legs of a transfer/payment in one call, cross-linked via linkedTransactionId — never call createTransaction twice for one transfer, the two legs need to reference each other's real (client-generated) ids. */
  createLinkedTransactionPair: (input: {
    fromAccountId: string;
    toAccountId: string;
    amount: number; // positive magnitude; the "from" leg is negated automatically
    occurredAt: string;
    type: "transfer" | "payment";
    merchant?: string | null;
    description?: string | null;
  }) => { fromTxn: Transaction; toTxn: Transaction };
  /** `categoryIds`, when provided, replaces this transaction's full tag-style category set (transaction_categories) — diffed against current state, not append-only. Plain `Partial<Transaction>` fields (including categoryId) are applied as before regardless of whether categoryIds is present. */
  updateTransaction: (transactionId: string, patch: Partial<Transaction> & { categoryIds?: string[] }) => void;
  trashTransaction: (transactionId: string) => void;
  restoreTransaction: (transactionId: string) => void;
  permanentlyDeleteTransaction: (transactionId: string) => void;

  // Finance — Tag-style multi-category links (transaction_categories,
  // Categories Foundation workstream). createTransaction/updateTransaction
  // above already accept an optional categoryIds list and call these
  // internally to stay in sync — most callers won't need these directly,
  // but they're exposed for a caller (e.g. a future bulk-categorize
  // workstream) that wants to add/remove one tag at a time without
  // resubmitting the whole transaction form.
  /** No-ops (doesn't insert a duplicate) if this transaction is already tagged with `categoryId` — the DB's own unique(transaction_id, category_id) constraint would reject it anyway, this just avoids the round trip. */
  addTransactionCategory: (transactionId: string, categoryId: string) => void;
  removeTransactionCategory: (transactionId: string, categoryId: string) => void;

  // Finance — Categories & rules (household-wide, no privacy layer)
  createFinanceCategory: (input: { name: string; parentCategoryId?: string | null }) => FinanceCategory;
  updateFinanceCategory: (categoryId: string, patch: Partial<FinanceCategory>) => void;
  /** Fails server-side (blocked by prevent_trash_referenced_category() trigger, PRD §32.6) if any non-trashed transaction still references this category — caller should reassign or archive first, not just retry. */
  trashFinanceCategory: (categoryId: string) => void;
  restoreFinanceCategory: (categoryId: string) => void;
  createCategoryRule: (input: { matchField: "merchant" | "description"; matchType?: "contains" | "exact"; matchValue: string; categoryId: string }) => CategoryRule;
  deleteCategoryRule: (ruleId: string) => void;

  // Finance — Budgeting v1: one standing monthly $ target per category.
  /** Create-or-update in one call (a real .upsert() on the household_id+category_id unique constraint) — the caller never needs to know ahead of time whether this category already has a budget. */
  setCategoryBudget: (categoryId: string, monthlyAmount: number) => void;
  /** Removes budgeting for a category entirely — a plain delete, not trash/retention (a budget amount is a current target, not a record worth keeping history of). */
  deleteCategoryBudget: (categoryId: string) => void;

  // Finance — Budgeting v2: shared household planning settings.
  /** Upsert on household_id — same create-or-update-in-one-call shape as setCategoryBudget. Pass null to clear a previously-set target (not the same as never having set one, but the UI treats both as "no target" today). */
  setTargetMonthlyIncome: (amount: number | null) => void;

  // Finance — Recurring bills
  createRecurringBill: (input: NewRecurringBillInput) => RecurringBill;
  updateRecurringBill: (billId: string, patch: Partial<RecurringBill>) => void;
  trashRecurringBill: (billId: string) => void;
  restoreRecurringBill: (billId: string) => void;
  permanentlyDeleteRecurringBill: (billId: string) => void;
  shareRecurringBill: (billId: string, withUserId: string) => void;
  unshareRecurringBill: (billId: string, withUserId: string) => void;
  /** Marks a detected-but-not-yet-tracked recurring pattern (TransactionRecurringCandidate.id, `${accountId}:${normalizedMerchantKey}`) as "not recurring" so /finance/recurring/detected stops surfacing it. No-op if already dismissed (the DB's own unique(account_id, candidate_key) would reject a duplicate anyway). */
  dismissRecurringCandidate: (accountId: string, candidateKey: string) => void;
  /** Undoes a dismissal — lets the candidate reappear on the next detection run. */
  undismissRecurringCandidate: (accountId: string, candidateKey: string) => void;
  /** Manually records today's balance for every active account as one AccountBalanceSnapshot batch (source: 'manual') — real usable history without waiting on the nightly scheduled job (PRD §30) this pass doesn't set up. */
  recordNetWorthSnapshot: () => void;
  /** Uploads a receipt image to the shared "attachments" Storage bucket and links it to a transaction. Real, awaited: same reasoning as addAttachment — a file has to actually finish uploading before there's anything to show. `sourceDraftId` is set when this comes from confirming a scanned receipt, omitted for a manually-attached one. */
  addTransactionAttachment: (transactionId: string, input: { file: File; sourceDraftId?: string | null }) => Promise<{ ok: boolean; error?: string; attachment?: TransactionAttachment }>;
  /** Registers a row for an image that's *already* in Storage — confirming a scanned receipt reuses the photo receipt-scan-session-store.ts uploaded during extraction rather than uploading it a second time. Real, awaited: same "don't show it as attached before the row actually exists" reasoning as addTransactionAttachment. */
  linkTransactionAttachment: (transactionId: string, input: { storagePath: string; contentType: string; sizeBytes: number; sourceDraftId: string }) => Promise<{ ok: boolean; error?: string; attachment?: TransactionAttachment }>;
  /** Deletes a permanently-retained receipt image (not part of the normal trash lifecycle — same "created and deleted, never edited in place" shape as inventory's own attachments). */
  deleteTransactionAttachment: (attachmentId: string) => void;
  /** Records one completed CSV import run as an audit row (PRD §10) — write-once, not part of the hydrated bundle/Realtime like every other Finance table, since nothing in the UI reads it back yet (no import-history screen this pass). Real, awaited: the caller wants the real row back to show in the wizard's "complete" summary. */
  recordCsvImportBatch: (input: { accountId: string; fileName: string; columnMapping: Record<string, string>; rowCount: number; duplicateCount: number }) => Promise<CsvImportBatch>;

  // Item ↔ transaction linking (0017_household_ledger_core.sql, PRD §25 —
  // "the product's actual differentiator"). Always user-initiated: PRD §25
  // is explicit that this is assisted/opportunistic matching with
  // confirmation, never a silent automatic link, so every call site here
  // is a direct response to a tap, never a background job.
  /** Creates one item_purchases row. At least one of transactionId/scannedReceiptLineItemId must be set (mirrors the DB check constraint) — pass whichever the calling flow has: a confirmed transaction (Transaction Detail, Item Detail) or a not-yet-confirmed receipt line item (Receipt Review). */
  linkItemPurchase: (input: {
    itemId: string;
    transactionId?: string | null;
    scannedReceiptLineItemId?: string | null;
    source: ItemPurchaseSource;
  }) => Promise<{ ok: boolean; error?: string; purchase?: ItemPurchase }>;
  /** Removes a link without touching the item, transaction, or line item it pointed at — undoing a mistaken/no-longer-wanted match, not a purchase record itself. */
  unlinkItemPurchase: (purchaseId: string) => void;

  // Favorites
  toggleFavorite: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;

  // Household / members
  /** Creates a brand-new household via create_household(), adds the current user as its Owner, switches to it, and starts it with empty inventory. Real, awaited: the household id is server-generated. */
  createHousehold: (input: {
    name: string;
    displayName: string;
    email: string;
    avatarUrl?: string;
    /** Both default true (households.finance_enabled/inventory_enabled) — omit only for a call site that genuinely doesn't ask (there shouldn't be one left after household-setup's domain-choice step ships). */
    financeEnabled?: boolean;
    inventoryEnabled?: boolean;
  }) => Promise<Household>;
  /** Swaps the active household's data for another one the current user belongs to (fetched fresh, or from this session's cache). No-op if already current. */
  switchHousehold: (householdId: string) => Promise<void>;
  /** Owner-only (RLS: "household owner update" on households) change to the domain choice made at household-setup (0033_household_domains.sql). Rejects client-side before the round-trip if it would leave both disabled — the DB's own check constraint would reject it anyway, this just gives a real error message instead of a generic one. */
  updateHouseholdDomains: (
    householdId: string,
    patch: { financeEnabled?: boolean; inventoryEnabled?: boolean }
  ) => Promise<{ ok: boolean; error?: string }>;
  /** Owner-only (same RLS as updateHouseholdDomains) rename — the household-setup naming screen has claimed "You can rename this later from Settings" since it shipped; this is what actually makes that true. */
  renameHousehold: (householdId: string, name: string) => Promise<{ ok: boolean; error?: string }>;
  /** Redeems the caller's own pending invite (matched server-side by their authenticated email, via accept_invite_by_email()) and switches to the joined household. `email` is a client-side confirmation check, not what's sent to the server. */
  acceptInvite: (email: string, displayName: string) => Promise<{ ok: boolean; error?: string; household?: Household }>;
  /** Read-only counterpart to acceptInvite: checks whether the caller's own authenticated email has a pending, unexpired invite waiting, without accepting it (find_pending_invite_by_email(), 0019_pending_invite_check.sql — the same auth.email()-keyed lookup accept_invite_by_email() uses, but no mutation). Null when there's nothing pending. household-setup/page.tsx calls this before auto-creating a household, so a genuine invitee gets a chance to join instead of an unwanted household getting created out from under them. */
  checkPendingInvite: () => Promise<{ householdName: string; invitedByDisplayName: string | null } | null>;
  /** Leaves the current household. Blocked if the caller is its Owner (transfer ownership first) or if it's their only household. Real, awaited. */
  leaveHousehold: () => Promise<{ ok: boolean; error?: string }>;
  /** `personId` scopes this invite to convert one existing managed profile (PRD §23) — omit for an ordinary invite, which creates a fresh Person row on acceptance instead (0022_invite_target_person.sql). */
  inviteMember: (email: string, personId?: string | null) => void;
  cancelInvite: (inviteId: string) => void;
  removeMember: (userId: string) => void;
  transferOwnership: (toUserId: string) => void;
  /** Updates the caller's own membership row in the current household (display name, avatar). Real, awaited. */
  updateMyProfile: (patch: { displayName?: string; avatarUrl?: string; timezone?: string | null }) => Promise<{ ok: boolean; error?: string }>;
  /** Owner-only (server-enforced, see api-keys/route.ts). Real, awaited — the raw secret only ever exists in this one response, so unlike almost everything else in this store there's nothing to show optimistically before the round trip completes. */
  generateApiKey: (label: string) => Promise<{ ok: true; apiKey: ApiKey; secret: string } | { ok: false; error: string }>;
  /** Soft-revoke (sets revokedAt, doesn't delete the row) — plain RLS-backed update via the browser client, same shape as cancelInvite, no server route needed. */
  revokeApiKey: (id: string) => void;

  // People (PRD §8/§9/§23) — both authenticated members (linkedUserId set,
  // created automatically by create_household()/accept_invite()) and
  // managed profiles (linkedUserId null) live here.
  /**
   * Creates a Person row without an avatar — call setPersonAvatar after, if
   * the caller collected a photo, same two-step shape as createItem +
   * setItemCoverPhoto. Real, awaited (not the optimistic-then-revert shape
   * most create* actions use): a caller like AddPersonSheet immediately
   * treats the returned id as a real, selectable person — e.g. selecting
   * them in an ownership picker — and an optimistic id that later reverted
   * out from under that selection would leave the picker silently pointing
   * at a person that no longer exists.
   */
  addPerson: (input: NewPersonInput) => Promise<{ ok: boolean; error?: string; person?: Person }>;
  updatePerson: (personId: string, patch: Partial<Pick<Person, "displayName" | "relationship">>) => void;
  /** Removes a Person row. Any item owned by them falls back to unowned/household (items.owner_person_id references people(id) on delete set null) rather than being deleted or reassigned. */
  deletePerson: (personId: string) => void;
  /** Uploads `file` to the public "item-photos" bucket and points the Person at it, replacing any existing avatar. Real, awaited: same reasoning as setItemCoverPhoto. */
  setPersonAvatar: (personId: string, file: File) => Promise<{ ok: boolean; error?: string }>;
  removePersonAvatar: (personId: string) => void;

  // Activity
  logActivity: (entry: {
    entityType: ActivityEntityType;
    entityId: string;
    entityName: string;
    action: ActivityAction;
    detail?: string;
  }) => void;
  /** Stamps the caller's own membership row with now() as their last-viewed watermark (0025_activity_last_viewed.sql) — call on visiting /activity so the Overview page's bell badge stops counting today's rows as unread. Optimistic, fire-and-forget like logActivity: losing this update to a transient network error just means the badge undercounts slightly next time, not worth blocking or rolling back the visit over. */
  markActivityViewed: () => void;

  /** Hides items/containers/locations whose permanentlyDeleteAfter has passed from local state. The real purge_expired_trash() + pg_cron job (see the migration) does the actual server-side deletion; this just keeps the UI in sync between reloads without re-fetching. */
  purgeExpiredTrash: () => void;
}

/** Re-exported for src/components/activity-row.tsx and friends, which import this name from the store rather than src/lib/types. */
export type ActivityLogAppend = ActivityLogEntry;

function nowIso(): string {
  return new Date().toISOString();
}

function purgeAfter(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
  return d.toISOString();
}

/** Everything that's swapped out when switching households — mirrors otherHouseholdData's old shape, now backed by real fetches instead of static seed bundles. */
interface HouseholdBundle {
  members: Member[];
  invites: Invite[];
  apiKeys: ApiKey[];
  people: Person[];
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  notes: Note[];
  tasks: HouseholdTask[];
  taskCompletions: TaskCompletion[];
  taskCategories: TaskCategoryRecord[];
  subtasks: TaskSubtask[];
  favorites: Favorite[];
  activity: ActivityLogEntry[];
  attachments: Attachment[];
  itemStudioPhotos: ItemStudioPhoto[];
  itemDocumentLinks: ItemDocumentLink[];
  pinnedLocations: PinnedLocation[];
  labelBatches: LabelBatch[];
  labelBatchEntries: LabelBatchEntry[];
  normalizationRules: NormalizationRule[];
  accounts: Account[];
  financeAccountShares: FinanceAccountShare[];
  transactions: Transaction[];
  financeCategories: FinanceCategory[];
  categoryRules: CategoryRule[];
  recurringBills: RecurringBill[];
  financeBillShares: FinanceBillShare[];
  recurringCandidateDismissals: RecurringCandidateDismissal[];
  accountBalanceSnapshots: AccountBalanceSnapshot[];
  creditCardLiabilities: CreditCardLiability[];
  transactionAttachments: TransactionAttachment[];
  transactionCategories: TransactionCategory[];
  categoryBudgets: CategoryBudget[];
  financeSettings: FinanceSettings | null;
  itemPurchases: ItemPurchase[];
  lastUsedDestination: { locationId: string | null; containerId: string | null } | null;
}

function snapshotBundle(state: InventoryState): HouseholdBundle {
  return {
    members: state.members,
    invites: state.invites,
    apiKeys: state.apiKeys,
    people: state.people,
    locations: state.locations,
    containers: state.containers,
    items: state.items,
    tags: state.tags,
    notes: state.notes,
    tasks: state.tasks,
    taskCompletions: state.taskCompletions,
    taskCategories: state.taskCategories,
    subtasks: state.subtasks,
    favorites: state.favorites,
    activity: state.activity,
    attachments: state.attachments,
    itemStudioPhotos: state.itemStudioPhotos,
    itemDocumentLinks: state.itemDocumentLinks,
    pinnedLocations: state.pinnedLocations,
    labelBatches: state.labelBatches,
    labelBatchEntries: state.labelBatchEntries,
    normalizationRules: state.normalizationRules,
    accounts: state.accounts,
    financeAccountShares: state.financeAccountShares,
    transactions: state.transactions,
    financeCategories: state.financeCategories,
    categoryRules: state.categoryRules,
    recurringBills: state.recurringBills,
    financeBillShares: state.financeBillShares,
    recurringCandidateDismissals: state.recurringCandidateDismissals,
    accountBalanceSnapshots: state.accountBalanceSnapshots,
    creditCardLiabilities: state.creditCardLiabilities,
    transactionAttachments: state.transactionAttachments,
    transactionCategories: state.transactionCategories,
    categoryBudgets: state.categoryBudgets,
    financeSettings: state.financeSettings,
    itemPurchases: state.itemPurchases,
    lastUsedDestination: state.lastUsedDestination,
  };
}

/** Fetches everything scoped to one household in parallel. */
async function fetchHouseholdBundle(
  supabase: SupabaseClient,
  householdId: string,
  userId: string
): Promise<HouseholdBundle> {
  const [
    membersRes,
    invitesRes,
    apiKeysRes,
    peopleRes,
    locationsRes,
    containersRes,
    itemsRes,
    tagsRes,
    notesRes,
    tasksRes,
    taskCompletionsRes,
    taskCategoriesRes,
    subtasksRes,
    favoritesRes,
    activityRes,
    attachmentsRes,
    itemStudioPhotosRes,
    itemDocumentLinksRes,
    pinnedLocationsRes,
    labelBatchesRes,
    labelBatchEntriesRes,
    normalizationRulesRes,
    accountsRes,
    financeAccountSharesRes,
    transactionsRes,
    financeCategoriesRes,
    categoryRulesRes,
    recurringBillsRes,
    financeBillSharesRes,
    recurringCandidateDismissalsRes,
    transactionAttachmentsRes,
    transactionCategoriesRes,
    categoryBudgetsRes,
    financeSettingsRes,
    itemPurchasesRes,
  ] = await Promise.all([
    supabase.from("members").select("*").eq("household_id", householdId),
    supabase.from("invites").select("*").eq("household_id", householdId),
    // Never `select("*")` here — key_hash has no business in a client
    // bundle even for the owner it belongs to (RLS already limits reads to
    // the owner; this is a second, independent reason it never leaves the
    // server). Empty result for a non-owner member — RLS's "owner read"
    // policy on api_keys, not an error, same as any other RLS-filtered
    // query.
    supabase.from("api_keys").select("id, household_id, created_by_user_id, label, key_prefix, last_four, created_at, last_used_at, revoked_at").eq("household_id", householdId),
    supabase.from("people").select("*").eq("household_id", householdId),
    supabase.from("locations").select("*").eq("household_id", householdId),
    supabase.from("containers").select("*").eq("household_id", householdId),
    supabase.from("items").select("*, item_tags(tag_id)").eq("household_id", householdId),
    supabase.from("tags").select("*").eq("household_id", householdId),
    // RLS's can_view_note() already returns exactly what the caller should
    // see (their own personal notes + every shared note in the household) —
    // same "no further client-side filtering needed" guarantee as accounts.
    supabase.from("notes").select("*").eq("household_id", householdId),
    supabase.from("household_tasks").select("*").eq("household_id", householdId),
    supabase.from("task_completions").select("*").eq("household_id", householdId),
    // System default categories (household_id null) are visible to every
    // household — same reasoning/shape as the `categories` (Finance) fetch
    // below: a plain .eq("household_id", householdId) can't match a NULL
    // column, so this needs the same .or() as that one.
    supabase.from("task_categories").select("*").or(`household_id.eq.${householdId},household_id.is.null`),
    supabase.from("task_subtasks").select("*").eq("household_id", householdId),
    supabase.from("favorites").select("*, items!inner(household_id)").eq("user_id", userId).eq("items.household_id", householdId),
    supabase.from("activity_log").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(500),
    supabase.from("attachments").select("*").eq("household_id", householdId),
    supabase.from("item_studio_photos").select("*").eq("household_id", householdId),
    supabase.from("item_document_links").select("*").eq("household_id", householdId),
    supabase.from("pinned_locations").select("*").eq("household_id", householdId),
    supabase.from("label_batches").select("*").eq("household_id", householdId).order("created_at", { ascending: false }),
    supabase.from("label_batch_entries").select("*").eq("household_id", householdId),
    supabase.from("normalization_rules").select("*").eq("household_id", householdId),
    // Finance — RLS on `accounts` already returns only joint accounts +
    // the caller's own personal accounts + accounts shared with them, so
    // this is the *complete* set the caller should ever see, not a
    // superset that needs further client-side filtering.
    supabase.from("accounts").select("*").eq("household_id", householdId),
    supabase.from("finance_account_shares").select("*").eq("household_id", householdId),
    supabase.from("transactions").select("*").eq("household_id", householdId).order("occurred_at", { ascending: false }),
    // System default categories (household_id null) are visible to every
    // household per RLS's own "household member read/write" policy would
    // NOT normally match a null household_id row — but categories were
    // deliberately given a plain is_household_member(household_id) policy
    // in 0010_finance_schema.sql, same as every other household-scoped
    // table, which means a null-household default category needs its own
    // fetch (RLS can't match `household_id = :householdId` against a NULL
    // column). Two queries, one merged result.
    supabase.from("categories").select("*").or(`household_id.eq.${householdId},household_id.is.null`),
    supabase.from("category_rules").select("*").eq("household_id", householdId),
    supabase.from("recurring_bills").select("*").eq("household_id", householdId),
    supabase.from("finance_bill_shares").select("*").eq("household_id", householdId),
    supabase.from("recurring_candidate_dismissals").select("*").eq("household_id", householdId),
    supabase.from("transaction_attachments").select("*").eq("household_id", householdId),
    supabase.from("transaction_categories").select("*").eq("household_id", householdId),
    supabase.from("category_budgets").select("*").eq("household_id", householdId),
    // Budgeting v2 — at most one row per household; maybeSingle() rather
    // than select() + [0], since "no row yet" (household never set a
    // target income) is a real, expected, non-error state, not an empty
    // array to special-case at every call site.
    supabase.from("finance_settings").select("*").eq("household_id", householdId).maybeSingle(),
    supabase.from("item_purchases").select("*").eq("household_id", householdId),
  ]);

  const firstError =
    membersRes.error ?? invitesRes.error ?? apiKeysRes.error ?? peopleRes.error ?? locationsRes.error ?? containersRes.error ?? itemsRes.error ?? tagsRes.error ?? notesRes.error ?? tasksRes.error ?? taskCompletionsRes.error ?? taskCategoriesRes.error ?? subtasksRes.error ?? favoritesRes.error ?? activityRes.error ??
    attachmentsRes.error ?? itemStudioPhotosRes.error ?? itemDocumentLinksRes.error ?? pinnedLocationsRes.error ?? labelBatchesRes.error ?? labelBatchEntriesRes.error ?? normalizationRulesRes.error ??
    accountsRes.error ?? financeAccountSharesRes.error ?? transactionsRes.error ?? financeCategoriesRes.error ?? categoryRulesRes.error ?? recurringBillsRes.error ?? financeBillSharesRes.error ??
    recurringCandidateDismissalsRes.error ??
    transactionAttachmentsRes.error ?? transactionCategoriesRes.error ?? categoryBudgetsRes.error ?? financeSettingsRes.error ?? itemPurchasesRes.error;
  if (firstError) throw new Error(firstError.message);

  // account_balance_snapshots has no household_id column of its own
  // (visibility inherited via account_id, same as transactions) — can't
  // be filtered by household in the Promise.all batch above the way
  // every other table is, since there's nothing to filter *on* until the
  // account ids are known. Fetched as a second, sequential step instead of
  // breaking the parallel-fetch pattern for every other table.
  const accountIds = ((accountsRes.data ?? []) as AccountRow[]).map((a) => a.id);
  const snapshotsRes = accountIds.length > 0
    ? await supabase.from("account_balance_snapshots").select("*").in("account_id", accountIds)
    : { data: [], error: null };
  if (snapshotsRes.error) throw new Error(snapshotsRes.error.message);

  // credit_card_liabilities — same no-household_id-column reasoning as
  // account_balance_snapshots just above, same accountIds reused.
  const creditCardLiabilitiesRes = accountIds.length > 0
    ? await supabase.from("credit_card_liabilities").select("*").in("account_id", accountIds)
    : { data: [], error: null };
  if (creditCardLiabilitiesRes.error) throw new Error(creditCardLiabilitiesRes.error.message);

  type ItemRowWithTags = ItemRow & { item_tags: { tag_id: string }[] | null };
  const accountRows = (accountsRes.data ?? []) as AccountRow[];
  const visibleAccountIds = new Set(accountRows.map((a) => a.id));
  // Defense in depth for the finance privacy model: transactions are only
  // meaningful if their account is also visible to the caller. RLS should
  // already enforce this through can_view_account(account_id), but keeping
  // the hydrated client bundle internally consistent prevents a bad policy
  // or realtime edge from surfacing another member's private-account rows
  // in transaction lists.
  const transactionRows = ((transactionsRes.data ?? []) as TransactionRow[]).filter((t) => visibleAccountIds.has(t.account_id));
  const visibleTransactionIds = new Set(transactionRows.map((t) => t.id));

  return {
    members: ((membersRes.data ?? []) as MemberRow[]).map(rowToMember),
    invites: ((invitesRes.data ?? []) as InviteRow[]).map(rowToInvite),
    apiKeys: ((apiKeysRes.data ?? []) as ApiKeyRow[]).map(rowToApiKey),
    people: ((peopleRes.data ?? []) as PersonRow[]).map(rowToPerson),
    locations: ((locationsRes.data ?? []) as LocationRow[]).map(rowToLocation),
    containers: ((containersRes.data ?? []) as ContainerRow[]).map(rowToContainer),
    items: ((itemsRes.data ?? []) as ItemRowWithTags[]).map((row) => rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id))),
    tags: ((tagsRes.data ?? []) as TagRow[]).map(rowToTag),
    notes: ((notesRes.data ?? []) as NoteRow[]).map(rowToNote),
    tasks: ((tasksRes.data ?? []) as HouseholdTaskRow[]).map(rowToHouseholdTask),
    taskCompletions: ((taskCompletionsRes.data ?? []) as TaskCompletionRow[]).map(rowToTaskCompletion),
    taskCategories: ((taskCategoriesRes.data ?? []) as TaskCategoryRow[]).map(rowToTaskCategory),
    subtasks: ((subtasksRes.data ?? []) as TaskSubtaskRow[]).map(rowToTaskSubtask),
    favorites: ((favoritesRes.data ?? []) as FavoriteRow[]).map(rowToFavorite),
    activity: ((activityRes.data ?? []) as ActivityLogRow[]).map(rowToActivityLogEntry),
    attachments: ((attachmentsRes.data ?? []) as AttachmentRow[]).map(rowToAttachment),
    itemStudioPhotos: ((itemStudioPhotosRes.data ?? []) as ItemStudioPhotoRow[]).map(rowToItemStudioPhoto),
    itemDocumentLinks: ((itemDocumentLinksRes.data ?? []) as ItemDocumentLinkRow[]).map(rowToItemDocumentLink),
    pinnedLocations: ((pinnedLocationsRes.data ?? []) as PinnedLocationRow[]).map(rowToPinnedLocation),
    labelBatches: ((labelBatchesRes.data ?? []) as LabelBatchRow[]).map(rowToLabelBatch),
    labelBatchEntries: ((labelBatchEntriesRes.data ?? []) as LabelBatchEntryRow[]).map(rowToLabelBatchEntry),
    normalizationRules: ((normalizationRulesRes.data ?? []) as NormalizationRuleRow[]).map(rowToNormalizationRule),
    accounts: accountRows.map(rowToAccount),
    financeAccountShares: ((financeAccountSharesRes.data ?? []) as FinanceAccountShareRow[]).filter((s) => visibleAccountIds.has(s.account_id)).map(rowToFinanceAccountShare),
    transactions: transactionRows.map(rowToTransaction),
    financeCategories: ((financeCategoriesRes.data ?? []) as FinanceCategoryRow[]).map(rowToFinanceCategory),
    categoryRules: ((categoryRulesRes.data ?? []) as CategoryRuleRow[]).map(rowToCategoryRule),
    recurringBills: ((recurringBillsRes.data ?? []) as RecurringBillRow[]).map(rowToRecurringBill),
    financeBillShares: ((financeBillSharesRes.data ?? []) as FinanceBillShareRow[]).map(rowToFinanceBillShare),
    recurringCandidateDismissals: ((recurringCandidateDismissalsRes.data ?? []) as RecurringCandidateDismissalRow[]).map(rowToRecurringCandidateDismissal),
    accountBalanceSnapshots: ((snapshotsRes.data ?? []) as AccountBalanceSnapshotRow[]).map(rowToAccountBalanceSnapshot),
    creditCardLiabilities: ((creditCardLiabilitiesRes.data ?? []) as CreditCardLiabilityRow[]).map(rowToCreditCardLiability),
    transactionAttachments: ((transactionAttachmentsRes.data ?? []) as TransactionAttachmentRow[]).filter((a) => visibleTransactionIds.has(a.transaction_id)).map(rowToTransactionAttachment),
    transactionCategories: ((transactionCategoriesRes.data ?? []) as TransactionCategoryRow[]).filter((c) => visibleTransactionIds.has(c.transaction_id)).map(rowToTransactionCategory),
    categoryBudgets: ((categoryBudgetsRes.data ?? []) as CategoryBudgetRow[]).map(rowToCategoryBudget),
    financeSettings: financeSettingsRes.data ? rowToFinanceSettings(financeSettingsRes.data as FinanceSettingsRow) : null,
    itemPurchases: ((itemPurchasesRes.data ?? []) as ItemPurchaseRow[])
      .filter((p) => !p.transaction_id || visibleTransactionIds.has(p.transaction_id))
      .map(rowToItemPurchase),
    lastUsedDestination: null,
  };
}

/** Optimistic-write helper: applies the caller's local update first, then fires `op`; on failure, rolls the local state back and toasts an error. `op` is any thenable resolving to `{ error }` — a Supabase query builder result, an rpc() call, or a manual async IIFE combining more than one write. */
function persistOrRevert(op: PromiseLike<{ error: { message: string } | null }>, revert: () => void, label: string) {
  Promise.resolve(op).then(({ error }) => {
    if (error) {
      revert();
      toast.error(`${label}: ${error.message}`);
    }
  });
}

/** Shared upload step for item/location/container cover photos — all three
 * point at the same public "item-photos" bucket and follow the same fresh-
 * id-per-upload pattern (not upsert-in-place: upsert needs an UPDATE
 * storage policy in addition to INSERT, which the bucket's migration
 * deliberately doesn't grant). Callers own updating their own entity's
 * local state and row, and cleaning up `previousPath` once the new one is
 * confirmed live — this only handles validation + the upload itself.
 *
 * Exported so the capture-review flow can call it directly for a
 * newly-detected item's cropped cover photo, uploading it *before* the item
 * row exists and passing the resulting path in via NewItemInput.coverPhotoPath
 * — one insert with the right path already on it, instead of create-then-
 * setItemCoverPhoto's separate insert-then-update, which raced against the
 * batch insert for multi-item saves (the insert and each item's own
 * cover-photo update could arrive at Postgres out of order, and an update
 * against a row that doesn't exist yet just silently affects zero rows —
 * no error, no photo, and nothing about it visible to the user). */
export async function uploadCoverPhotoFile(file: File, householdId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return { ok: false, error: "Only images can be used as a cover photo." };
  }
  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return { ok: false, error: `File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.` };
  }
  // Unlike the capture flow's own photos, this is the raw file straight off
  // "choose/take a photo" with nothing done to it yet — bakes in real
  // orientation (a phone photo taken sideways/upside-down otherwise showed
  // that way everywhere it's used) and caps resolution, same as capture's.
  const normalized = await normalizeUploadedPhoto(file);
  const supabase = getSupabaseBrowserClient();
  const path = `${householdId}/${newId()}`;
  const { error: uploadError } = await supabase.storage.from("item-photos").upload(path, normalized, { contentType: normalized.type });
  if (uploadError) return { ok: false, error: uploadError.message };
  return { ok: true, path };
}

/**
 * Background-removal counterpart to uploadCoverPhotoFile above — same
 * output shape (a path already sitting in the "item-photos" bucket), but
 * calls POST /api/v1/vision/remove-background (local segmentation via
 * @imgly/background-removal-node — see lib/vision/remove-background.ts)
 * instead of uploading a file directly. Exported for capture/review/page.tsx
 * to call alongside uploadCoverPhotoFile, on the same already-cropped
 * detection photo, before the item row exists — same reasoning as
 * uploadCoverPhotoFile's own doc comment above for doing this pre-insert
 * rather than a separate post-create update.
 */
export async function removeItemBackgroundViaAPI(
  photoDataUrl: string,
  householdId: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/v1/vision/remove-background", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId, photo: photoDataUrl }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't remove the background." };
    return { ok: true, path: data.path };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }
}

/**
 * AI-generation counterpart to uploadCoverPhotoFile above — same output
 * shape (a path already sitting in the "item-photos" bucket), just
 * produced by POST /api/v1/vision/generate-location-photo (the actual
 * generateImage() call is server-only, per lib/vision/generate-location-
 * photo.ts) instead of a local file. Kept separate from that route's own
 * validation/auth rather than inlined into generateLocationCoverPhoto
 * below so the fetch-and-parse boilerplate isn't duplicated if a second
 * caller (e.g. Container cover photos) wants the same AI-generate flow
 * later.
 */
async function generateCoverPhotoViaAI(
  locationId: string,
  householdId: string,
  roomType: string,
  detail: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/v1/vision/generate-location-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId, locationId, roomType, detail: detail || undefined }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't generate a photo." };
    return { ok: true, path: data.path };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection." };
  }
}

function removeCoverPhotoObject(path: string, context: string) {
  getSupabaseBrowserClient()
    .storage.from("item-photos")
    .remove([path])
    .then(({ error }) => {
      if (error) console.error(`Failed to remove ${context} from storage:`, error.message);
    });
}

/** Home Map (pinned_locations) photo upload — private "attachments" bucket,
 * not "item-photos": see PinnedLocation's own doc comment for why. Fixed
 * path per pin (migration 0017's documented convention), not a fresh id
 * per upload like uploadCoverPhotoFile — "attachments" grants no UPDATE
 * storage policy either, so a photo *replacement* removes the old object
 * at that same path first (see updatePinnedLocation) rather than upserting. */
async function uploadPinnedLocationPhoto(
  file: File,
  householdId: string,
  pinnedLocationId: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return { ok: false, error: "Only images can be used as a photo." };
  }
  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
    return { ok: false, error: `File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.` };
  }
  const normalized = await normalizeUploadedPhoto(file);
  const supabase = getSupabaseBrowserClient();
  // A fresh path per upload (matching uploadCoverPhotoFile's own scheme),
  // not the fixed `${householdId}/pinned-locations/${pinnedLocationId}` this
  // used to be — that fixed path meant a *replacement* upload had to delete
  // the old object first (no update/upsert policy on this bucket, insert-
  // only), which made updatePinnedLocation's old-photo-delete happen before
  // the new photo_path was durably written. A DB update failure after that
  // point left the row (and reverted client state) pointing at an object
  // that no longer existed — a permanent 404 until someone manually
  // re-uploaded (Household Ledger Implementation Plan §9). A unique path
  // per upload lets updatePinnedLocation follow the same safe order
  // setLocationCoverPhoto already uses: upload new, write the DB row, only
  // *then* delete the old object — so a failure after the upload never
  // destroys the only copy still referenced by (reverted) state.
  const path = `${householdId}/pinned-locations/${pinnedLocationId}/${newId()}`;
  const { error: uploadError } = await supabase.storage.from("attachments").upload(path, normalized, { contentType: normalized.type });
  if (uploadError) return { ok: false, error: uploadError.message };
  return { ok: true, path };
}

function removePinnedLocationPhotoObject(path: string, context: string) {
  getSupabaseBrowserClient()
    .storage.from("attachments")
    .remove([path])
    .then(({ error }) => {
      if (error) console.error(`Failed to remove ${context} from storage:`, error.message);
    });
}

interface RealtimeRowChange {
  eventType: "INSERT" | "UPDATE" | "DELETE";
  new: Record<string, unknown>;
  old: Record<string, unknown>;
}

/**
 * Builds a postgres_changes handler that keeps one store array in sync by
 * key: INSERT/UPDATE map the row and replace-or-append it, DELETE removes
 * it. Covers every realtime-bound table except items (needs to preserve
 * tagIds, which isn't a column), item_tags and favorites (neither maps
 * onto a standalone array) — those three get bespoke handlers instead.
 */
function arrayMergeHandler<TRow, TDomain>(
  mapper: (row: TRow) => TDomain,
  keyOf: (item: TDomain) => string,
  rowKeyOf: (row: Record<string, unknown>) => string,
  apply: (updater: (current: TDomain[]) => TDomain[]) => void
) {
  return (payload: RealtimeRowChange) => {
    if (payload.eventType === "DELETE") {
      const oldKey = rowKeyOf(payload.old);
      apply((current) => current.filter((item) => keyOf(item) !== oldKey));
      return;
    }
    const mapped = mapper(payload.new as TRow);
    const mappedKey = keyOf(mapped);
    apply((current) => {
      const idx = current.findIndex((item) => keyOf(item) === mappedKey);
      if (idx === -1) return [...current, mapped];
      const next = current.slice();
      next[idx] = mapped;
      return next;
    });
  };
}

export const useInventoryStore = create<InventoryState>()((set, get) => {
  // Households the user belongs to besides the active one, keyed by id —
  // an in-memory cache of already-fetched bundles so switching back and
  // forth within a session doesn't re-fetch every time. Not shared across
  // reloads or other tabs; a cold hydrate() always fetches fresh.
  const otherHouseholdCache: Record<string, HouseholdBundle> = {};

  let hydratePromise: Promise<void> | null = null;
  let realtimeChannel: RealtimeChannel | null = null;

  return {
  households: [],
  currentHouseholdId: "",
  members: [],
  invites: [],
  apiKeys: [],
  people: [],
  locations: [],
  containers: [],
  items: [],
  tags: [],
  notes: [],
  tasks: [],
  taskCompletions: [],
  taskCategories: [],
  subtasks: [],
  normalizationRules: [],
  activity: [],
  favorites: [],
  attachments: [],
  itemStudioPhotos: [],
  itemDocumentLinks: [],
  pinnedLocations: [],
  labelBatches: [],
  labelBatchEntries: [],
  accounts: [],
  financeAccountShares: [],
  transactions: [],
  financeCategories: [],
  categoryRules: [],
  categoryBudgets: [],
  financeSettings: null,
  recurringBills: [],
  financeBillShares: [],
  recurringCandidateDismissals: [],
  accountBalanceSnapshots: [],
  creditCardLiabilities: [],
  transactionAttachments: [],
  transactionCategories: [],
  itemPurchases: [],
  currentUserId: "",
  currentUserEmail: "",
  lastUsedDestination: null,
  isHydrated: false,
  hydrationError: null,

  hydrate: () => {
    if (get().isHydrated) return Promise.resolve();
    if (hydratePromise) return hydratePromise;

    hydratePromise = (async () => {
      const supabase = getSupabaseBrowserClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) {
        set({ isHydrated: true, hydrationError: userError?.message ?? "Not signed in." });
        return;
      }

      const { data: memberRows, error: memberError } = await supabase
        .from("members")
        .select("*")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true });
      if (memberError) {
        set({ isHydrated: true, hydrationError: memberError.message, currentUserId: user.id, currentUserEmail: user.email ?? "" });
        return;
      }

      const myMemberships = ((memberRows ?? []) as MemberRow[]).map(rowToMember);
      if (myMemberships.length === 0) {
        set({
          isHydrated: true,
          hydrationError: null,
          currentUserId: user.id,
          currentUserEmail: user.email ?? "",
          households: [],
          currentHouseholdId: "",
        });
        return;
      }

      const householdIds = myMemberships.map((m) => m.householdId);
      const { data: householdRows, error: householdError } = await supabase.from("households").select("*").in("id", householdIds);
      if (householdError) {
        set({ isHydrated: true, hydrationError: householdError.message, currentUserId: user.id, currentUserEmail: user.email ?? "" });
        return;
      }

      const households = ((householdRows ?? []) as HouseholdRow[]).map(rowToHousehold);
      // myMemberships is sorted by joined_at ascending — land on the
      // oldest membership's household after a fresh sign-in.
      const currentHouseholdId = myMemberships[0].householdId;
      const bundle = await fetchHouseholdBundle(supabase, currentHouseholdId, user.id);

      set({
        isHydrated: true,
        hydrationError: null,
        currentUserId: user.id,
        currentUserEmail: user.email ?? "",
        households,
        currentHouseholdId,
        ...bundle,
      });
      get().subscribeRealtime(currentHouseholdId);
    })().finally(() => {
      hydratePromise = null;
    });

    return hydratePromise;
  },

  subscribeRealtime: (householdId) => {
    get().unsubscribeRealtime();
    const supabase = getSupabaseBrowserClient();
    const currentUserId = get().currentUserId;
    const householdFilter = `household_id=eq.${householdId}`;
    const channel = supabase.channel(`household-${householdId}`);

    function bind<TRow, TDomain>(
      table: string,
      filter: string,
      mapper: (row: TRow) => TDomain,
      keyOf: (item: TDomain) => string,
      rowKeyOf: (row: Record<string, unknown>) => string,
      stateKey:
        | "members" | "invites" | "people" | "locations" | "containers" | "tags" | "notes" | "tasks" | "taskCompletions" | "taskCategories" | "subtasks" | "activity" | "attachments" | "itemStudioPhotos" | "itemDocumentLinks" | "pinnedLocations"
        | "labelBatches" | "labelBatchEntries" | "normalizationRules"
        | "accounts" | "financeAccountShares" | "transactions" | "financeCategories" | "categoryRules" | "categoryBudgets"
        // financeSettings is NOT in this union — it's a single nullable
        // object, not an array (`bind`'s merge handler only ever operates
        // on TDomain[]) — it gets its own bespoke channel.on block below,
        // same reasoning as the `households` handler right above bind's
        // definition.
        | "recurringBills" | "financeBillShares" | "recurringCandidateDismissals" | "transactionAttachments" | "transactionCategories" | "itemPurchases"
    ) {
      const handler = arrayMergeHandler<TRow, TDomain>(mapper, keyOf, rowKeyOf, (updater) =>
        set((s) => ({ [stateKey]: updater(s[stateKey] as unknown as TDomain[]) }) as Partial<InventoryState>)
      );
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, (payload) => handler(payload as RealtimeRowChange));
    }

    // households isn't one of the per-household arrays (it's `households[]`
    // shared across every household the user belongs to) — handled here
    // directly instead of through `bind`'s stateKey union.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "households", filter: `id=eq.${householdId}` }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") return; // handled via leaveHousehold's own flow, not expected here
      const mapped = rowToHousehold(change.new as unknown as HouseholdRow);
      set((s) => ({ households: s.households.map((h) => (h.id === mapped.id ? mapped : h)) }));
    });

    bind<MemberRow, Member>("members", householdFilter, rowToMember, (m) => m.userId, (r) => r.user_id as string, "members");
    bind<InviteRow, Invite>("invites", householdFilter, rowToInvite, (i) => i.id, (r) => r.id as string, "invites");
    bind<PersonRow, Person>("people", householdFilter, rowToPerson, (p) => p.id, (r) => r.id as string, "people");
    bind<LocationRow, Location>("locations", householdFilter, rowToLocation, (l) => l.id, (r) => r.id as string, "locations");
    bind<ContainerRow, Container>("containers", householdFilter, rowToContainer, (c) => c.id, (r) => r.id as string, "containers");
    bind<TagRow, Tag>("tags", householdFilter, rowToTag, (t) => t.id, (r) => r.id as string, "tags");
    // Same "RLS filters what a subscriber actually receives" guarantee as
    // accounts above — a personal note belonging to another member never
    // arrives here.
    bind<NoteRow, Note>("notes", householdFilter, rowToNote, (n) => n.id, (r) => r.id as string, "notes");
    bind<HouseholdTaskRow, HouseholdTask>("household_tasks", householdFilter, rowToHouseholdTask, (t) => t.id, (r) => r.id as string, "tasks");
    bind<TaskCompletionRow, TaskCompletion>(
      "task_completions",
      householdFilter,
      rowToTaskCompletion,
      (c) => c.id,
      (r) => r.id as string,
      "taskCompletions"
    );
    // Same accepted limitation as the Finance `categories` bind just below
    // this one — a default row (household_id null) never matches
    // householdFilter, but defaults are seeded once and effectively
    // static, so this only misses a realtime update for a household's
    // *own* custom category edited from a second device, not the shared
    // defaults.
    bind<TaskCategoryRow, TaskCategoryRecord>("task_categories", householdFilter, rowToTaskCategory, (c) => c.id, (r) => r.id as string, "taskCategories");
    bind<TaskSubtaskRow, TaskSubtask>("task_subtasks", householdFilter, rowToTaskSubtask, (s) => s.id, (r) => r.id as string, "subtasks");
    bind<ActivityLogRow, ActivityLogEntry>("activity_log", householdFilter, rowToActivityLogEntry, (a) => a.id, (r) => r.id as string, "activity");
    bind<AttachmentRow, Attachment>("attachments", householdFilter, rowToAttachment, (a) => a.id, (r) => r.id as string, "attachments");
    bind<ItemStudioPhotoRow, ItemStudioPhoto>("item_studio_photos", householdFilter, rowToItemStudioPhoto, (p) => p.id, (r) => r.id as string, "itemStudioPhotos");
    bind<ItemDocumentLinkRow, ItemDocumentLink>("item_document_links", householdFilter, rowToItemDocumentLink, (l) => l.id, (r) => r.id as string, "itemDocumentLinks");
    bind<PinnedLocationRow, PinnedLocation>("pinned_locations", householdFilter, rowToPinnedLocation, (p) => p.id, (r) => r.id as string, "pinnedLocations");
    bind<LabelBatchRow, LabelBatch>("label_batches", householdFilter, rowToLabelBatch, (b) => b.id, (r) => r.id as string, "labelBatches");
    bind<LabelBatchEntryRow, LabelBatchEntry>("label_batch_entries", householdFilter, rowToLabelBatchEntry, (e) => e.id, (r) => r.id as string, "labelBatchEntries");
    bind<NormalizationRuleRow, NormalizationRule>("normalization_rules", householdFilter, rowToNormalizationRule, (n) => n.id, (r) => r.id as string, "normalizationRules");

    // Finance domain. `accounts` realtime matters more here than almost any
    // other table in this file: it's how a change on another device (or
    // the balance trigger firing after a transaction write from *this*
    // device) shows up as a live-updating balance without a manual
    // re-fetch. RLS still applies to what a subscriber actually receives —
    // a private account another member hasn't shared never arrives here.
    bind<AccountRow, Account>("accounts", householdFilter, rowToAccount, (a) => a.id, (r) => r.id as string, "accounts");
    bind<FinanceAccountShareRow, FinanceAccountShare>("finance_account_shares", householdFilter, rowToFinanceAccountShare, (s) => s.id, (r) => r.id as string, "financeAccountShares");
    const transactionHandler = arrayMergeHandler<TransactionRow, Transaction>(
      rowToTransaction,
      (t) => t.id,
      (r) => r.id as string,
      (updater) => set((s) => ({ transactions: updater(s.transactions) }))
    );
    channel.on("postgres_changes", { event: "*", schema: "public", table: "transactions", filter: householdFilter }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType !== "DELETE") {
        const row = change.new as unknown as TransactionRow;
        if (!get().accounts.some((a) => a.id === row.account_id)) {
          set((s) => ({ transactions: s.transactions.filter((t) => t.id !== row.id) }));
          return;
        }
      }
      transactionHandler(change);
    });
    bind<CategoryRuleRow, CategoryRule>("category_rules", householdFilter, rowToCategoryRule, (r) => r.id, (r) => r.id as string, "categoryRules");
    bind<CategoryBudgetRow, CategoryBudget>("category_budgets", householdFilter, rowToCategoryBudget, (b) => b.id, (r) => r.id as string, "categoryBudgets");
    // finance_settings: single nullable row per household, not an array —
    // same bespoke shape as the `households` handler above bind's own
    // definition, rather than forcing it through bind's TDomain[]-only
    // merge handler.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "finance_settings", filter: householdFilter }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") {
        set({ financeSettings: null });
        return;
      }
      set({ financeSettings: rowToFinanceSettings(change.new as unknown as FinanceSettingsRow) });
    });
    bind<RecurringBillRow, RecurringBill>("recurring_bills", householdFilter, rowToRecurringBill, (b) => b.id, (r) => r.id as string, "recurringBills");
    bind<FinanceBillShareRow, FinanceBillShare>("finance_bill_shares", householdFilter, rowToFinanceBillShare, (s) => s.id, (r) => r.id as string, "financeBillShares");
    bind<RecurringCandidateDismissalRow, RecurringCandidateDismissal>(
      "recurring_candidate_dismissals",
      householdFilter,
      rowToRecurringCandidateDismissal,
      (d) => d.id,
      (r) => r.id as string,
      "recurringCandidateDismissals"
    );
    // categories: filtered by household_id like everything else above,
    // which means it only catches this household's own custom categories
    // — a system default (household_id null) changing live wouldn't reach
    // here, since Realtime's filter syntax can't express "column IS NULL
    // OR column = X" in one subscription. Acceptable, documented gap:
    // system defaults are effectively static after seeding, unlike every
    // other table this store subscribes to.
    bind<FinanceCategoryRow, FinanceCategory>("categories", householdFilter, rowToFinanceCategory, (c) => c.id, (r) => r.id as string, "financeCategories");
    bind<TransactionAttachmentRow, TransactionAttachment>("transaction_attachments", householdFilter, rowToTransactionAttachment, (a) => a.id, (r) => r.id as string, "transactionAttachments");
    // transaction_categories (Categories Foundation workstream,
    // 0024_transaction_categories.sql) — same privacy-aware RLS as its own
    // initial fetch above; a tag on a private account's transaction only
    // reaches subscribers who can see that account.
    bind<TransactionCategoryRow, TransactionCategory>("transaction_categories", householdFilter, rowToTransactionCategory, (c) => c.id, (r) => r.id as string, "transactionCategories");
    // item_purchases (0017_household_ledger_core.sql, PRD §25) — same
    // privacy-aware RLS as its own initial fetch above; a link into a
    // private account's transaction only reaches subscribers who can see
    // that account.
    bind<ItemPurchaseRow, ItemPurchase>("item_purchases", householdFilter, rowToItemPurchase, (p) => p.id, (r) => r.id as string, "itemPurchases");

    // credit_card_liabilities: bespoke, same reason favorites/item_tags
    // below are — no household_id column on this table at all (visibility
    // inherited via account_id), so there's no `filter` this subscription
    // can use the way bind()'s stateKey union assumes every table can.
    // Subscribed unfiltered, guarded client-side by checking the account
    // is one of the currently-loaded household's own accounts.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "credit_card_liabilities" }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") {
        const accountId = change.old.account_id as string;
        set((s) => ({ creditCardLiabilities: s.creditCardLiabilities.filter((l) => l.accountId !== accountId) }));
        return;
      }
      const row = change.new as unknown as CreditCardLiabilityRow;
      if (!get().accounts.some((a) => a.id === row.account_id)) return;
      const mapped = rowToCreditCardLiability(row);
      set((s) => ({
        creditCardLiabilities: s.creditCardLiabilities.some((l) => l.accountId === mapped.accountId)
          ? s.creditCardLiabilities.map((l) => (l.accountId === mapped.accountId ? mapped : l))
          : [...s.creditCardLiabilities, mapped],
      }));
    });

    // items: bespoke, since tagIds is derived from item_tags, not a column
    // on this row — a bare replace-by-id would wipe it back to [] on every
    // unrelated edit (name, quantity, location...) to an item that already
    // has tags.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "items", filter: householdFilter }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") {
        const oldId = change.old.id as string;
        set((s) => ({ items: s.items.filter((it) => it.id !== oldId) }));
        return;
      }
      const row = change.new as unknown as ItemRow;
      set((s) => {
        const existing = s.items.find((it) => it.id === row.id);
        const mapped = rowToItem(row, existing?.tagIds ?? []);
        const idx = s.items.findIndex((it) => it.id === row.id);
        if (idx === -1) return { items: [...s.items, mapped] };
        const next = s.items.slice();
        next[idx] = mapped;
        return { items: next };
      });
    });

    // item_tags: pure join table, no household_id column — patches the
    // matching item's tagIds directly. The `.find`/`.map` against the
    // already-household-scoped local `items` array is itself the guard
    // against a foreign household's item_tags rows (RLS would block those
    // from arriving at all, but this is a second, cheap line of defense).
    channel.on("postgres_changes", { event: "*", schema: "public", table: "item_tags" }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") {
        const itemId = change.old.item_id as string;
        const tagId = change.old.tag_id as string;
        set((s) => ({ items: s.items.map((it) => (it.id === itemId ? { ...it, tagIds: it.tagIds.filter((id) => id !== tagId) } : it)) }));
        return;
      }
      const itemId = change.new.item_id as string;
      const tagId = change.new.tag_id as string;
      set((s) => ({
        items: s.items.map((it) => (it.id === itemId && !it.tagIds.includes(tagId) ? { ...it, tagIds: [...it.tagIds, tagId] } : it)),
      }));
    });

    // favorites: no household_id column at all (RLS scopes it via items) —
    // filtered by the caller's own user_id instead, then guarded against a
    // favorite in a *different* household the user also belongs to by
    // checking the item is one of the currently-loaded household's items.
    channel.on("postgres_changes", { event: "*", schema: "public", table: "favorites", filter: `user_id=eq.${currentUserId}` }, (payload) => {
      const change = payload as unknown as RealtimeRowChange;
      if (change.eventType === "DELETE") {
        const itemId = change.old.item_id as string;
        set((s) => ({ favorites: s.favorites.filter((f) => f.itemId !== itemId) }));
        return;
      }
      const row = change.new as unknown as FavoriteRow;
      if (!get().items.some((it) => it.id === row.item_id)) return;
      const mapped = rowToFavorite(row);
      set((s) => (s.favorites.some((f) => f.itemId === mapped.itemId) ? s : { favorites: [...s.favorites, mapped] }));
    });

    channel.subscribe((status, err) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.error("Realtime subscription failed:", status, err?.message);
      }
    });
    realtimeChannel = channel;
  },

  unsubscribeRealtime: () => {
    if (realtimeChannel) {
      getSupabaseBrowserClient().removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  },

  createHousehold: async (input) => {
    const supabase = getSupabaseBrowserClient();
    const state = get();
    const { data, error } = await supabase.rpc("create_household", {
      p_name: input.name,
      p_display_name: input.displayName,
      p_email: input.email,
      p_avatar_url: input.avatarUrl ?? null,
      p_finance_enabled: input.financeEnabled ?? true,
      p_inventory_enabled: input.inventoryEnabled ?? true,
    });
    if (error) throw new Error(error.message);
    const household = rowToHousehold(data as HouseholdRow);

    if (state.currentHouseholdId) {
      otherHouseholdCache[state.currentHouseholdId] = snapshotBundle(state);
    }
    const bundle = await fetchHouseholdBundle(supabase, household.id, state.currentUserId);
    set((s) => ({
      households: [...s.households, household],
      currentHouseholdId: household.id,
      ...bundle,
    }));
    get().subscribeRealtime(household.id);
    return household;
  },

  updateHouseholdDomains: async (householdId, patch) => {
    const state = get();
    const previous = state.households.find((h) => h.id === householdId);
    if (!previous) return { ok: false, error: "Household not found." };

    const merged: Household = { ...previous, ...patch };
    if (!merged.financeEnabled && !merged.inventoryEnabled) {
      return { ok: false, error: "Choose at least one — a household can't have both turned off." };
    }

    set((s) => ({ households: s.households.map((h) => (h.id === householdId ? merged : h)) }));

    const supabase = getSupabaseBrowserClient();
    const row: { finance_enabled?: boolean; inventory_enabled?: boolean } = {};
    if (patch.financeEnabled !== undefined) row.finance_enabled = patch.financeEnabled;
    if (patch.inventoryEnabled !== undefined) row.inventory_enabled = patch.inventoryEnabled;
    const { error } = await supabase.from("households").update(row).eq("id", householdId);
    if (error) {
      set((s) => ({ households: s.households.map((h) => (h.id === householdId ? previous : h)) }));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  renameHousehold: async (householdId, name) => {
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "Give your household a name." };

    const state = get();
    const previous = state.households.find((h) => h.id === householdId);
    if (!previous) return { ok: false, error: "Household not found." };

    set((s) => ({ households: s.households.map((h) => (h.id === householdId ? { ...h, name: trimmed } : h)) }));

    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.from("households").update({ name: trimmed }).eq("id", householdId);
    if (error) {
      set((s) => ({ households: s.households.map((h) => (h.id === householdId ? previous : h)) }));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  switchHousehold: async (householdId) => {
    const state = get();
    if (householdId === state.currentHouseholdId) return;
    if (!state.households.some((h) => h.id === householdId)) return;

    const supabase = getSupabaseBrowserClient();
    const cached = otherHouseholdCache[householdId];
    otherHouseholdCache[state.currentHouseholdId] = snapshotBundle(get());

    if (cached) {
      // Real bug this used to have: a cached household was trusted
      // forever, with nothing to correct it if that household's data
      // changed while it wasn't the active one — no realtime subscription
      // runs for a household you're not currently on, so another
      // member's edit, a cron job, a webhook, anything that touched it in
      // the meantime, was invisible until... nothing, actually; the stale
      // snapshot just kept getting reused on every switch back. Fixed
      // with the standard stale-while-revalidate shape: show the cached
      // snapshot immediately (instant switch, the whole reason this cache
      // exists), then reconcile against a real fetch right behind it.
      set({ currentHouseholdId: householdId, ...cached });
      get().subscribeRealtime(householdId);
      const fresh = await fetchHouseholdBundle(supabase, householdId, state.currentUserId);
      // Only apply if still on this household — a rapid second switch
      // elsewhere shouldn't have a slower first fetch clobber it later.
      if (get().currentHouseholdId === householdId) {
        set({ ...fresh });
        otherHouseholdCache[householdId] = fresh;
      }
      return;
    }

    const bundle = await fetchHouseholdBundle(supabase, householdId, state.currentUserId);
    set({ currentHouseholdId: householdId, ...bundle });
    get().subscribeRealtime(householdId);
  },

  acceptInvite: async (email, displayName) => {
    const state = get();
    if (email.trim().toLowerCase() !== state.currentUserEmail.toLowerCase()) {
      return { ok: false, error: "That email doesn't match your signed-in account." };
    }

    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("accept_invite_by_email", {
      p_display_name: displayName,
      p_avatar_url: null,
    });
    if (error) return { ok: false, error: error.message };
    const household = rowToHousehold(data as HouseholdRow);

    if (state.currentHouseholdId) {
      otherHouseholdCache[state.currentHouseholdId] = snapshotBundle(state);
    }
    const bundle = await fetchHouseholdBundle(supabase, household.id, state.currentUserId);
    set((s) => ({
      households: [...s.households, household],
      currentHouseholdId: household.id,
      ...bundle,
    }));
    get().subscribeRealtime(household.id);
    return { ok: true, household };
  },

  checkPendingInvite: async () => {
    const supabase = getSupabaseBrowserClient();
    const { data, error } = await supabase.rpc("find_pending_invite_by_email");
    // Fails open (null = proceed as if there's no invite) rather than
    // blocking onboarding on this being unreachable — a household-setup
    // caller that gets null here just falls through to auto-create, same
    // as the common case with no invite at all.
    if (error || !data || data.length === 0) return null;
    const row = data[0] as { household_name: string; invited_by_display_name: string | null };
    return { householdName: row.household_name, invitedByDisplayName: row.invited_by_display_name };
  },

  leaveHousehold: async () => {
    const state = get();
    const me = state.members.find((m) => m.userId === state.currentUserId);
    if (!me) return { ok: false, error: "You're not a member of this household." };
    if (me.role === "owner") return { ok: false, error: "Transfer ownership to another member before leaving." };
    if (state.households.length <= 1) return { ok: false, error: "You can't leave your only household." };

    // Logged before the delete below, not after — this insert is only
    // allowed by RLS while our own membership row (the one we're about to
    // remove) still exists.
    get().logActivity({ entityType: "member", entityId: me.userId, entityName: me.displayName, action: "left" });

    const supabase = getSupabaseBrowserClient();
    const leavingHouseholdId = state.currentHouseholdId;
    const { error } = await supabase.from("members").delete().eq("household_id", leavingHouseholdId).eq("user_id", state.currentUserId);
    if (error) return { ok: false, error: error.message };

    const nextHousehold = state.households.find((h) => h.id !== leavingHouseholdId)!;
    const bundle = otherHouseholdCache[nextHousehold.id] ?? (await fetchHouseholdBundle(supabase, nextHousehold.id, state.currentUserId));
    delete otherHouseholdCache[leavingHouseholdId];
    delete otherHouseholdCache[nextHousehold.id];

    set({
      households: state.households.filter((h) => h.id !== leavingHouseholdId),
      currentHouseholdId: nextHousehold.id,
      ...bundle,
    });
    get().subscribeRealtime(nextHousehold.id);
    return { ok: true };
  },

  createItem: (input) => {
    const supabase = getSupabaseBrowserClient();
    const created = buildItem(get().currentHouseholdId, get().currentUserId, input);
    set((s) => ({
      items: [...s.items, created],
      lastUsedDestination: { locationId: input.locationId, containerId: input.containerId },
    }));
    persistOrRevert(
      (async () => {
        const { error } = await supabase.from("items").insert(itemToInsertRow(created));
        if (error) return { error };
        if (created.tagIds.length > 0) {
          const { error: tagError } = await supabase.from("item_tags").insert(created.tagIds.map((tagId) => ({ item_id: created.id, tag_id: tagId })));
          if (tagError) return { error: tagError };
        }
        return { error: null };
      })(),
      () => set((s) => ({ items: s.items.filter((it) => it.id !== created.id) })),
      "Couldn't save item"
    );
    get().logActivity({ entityType: "item", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  createItemsBatch: (inputs) => {
    const supabase = getSupabaseBrowserClient();
    const created = inputs.map((i) => buildItem(get().currentHouseholdId, get().currentUserId, i));
    const last = inputs[inputs.length - 1];
    set((s) => ({
      items: [...s.items, ...created],
      lastUsedDestination: last ? { locationId: last.locationId, containerId: last.containerId } : s.lastUsedDestination,
    }));
    const allTagRows = created.flatMap((it) => it.tagIds.map((tagId) => ({ item_id: it.id, tag_id: tagId })));
    persistOrRevert(
      (async () => {
        const { error } = await supabase.from("items").insert(created.map(itemToInsertRow));
        if (error) return { error };
        if (allTagRows.length > 0) {
          const { error: tagError } = await supabase.from("item_tags").insert(allTagRows);
          if (tagError) return { error: tagError };
        }
        return { error: null };
      })(),
      () => set((s) => ({ items: s.items.filter((it) => !created.some((c) => c.id === it.id)) })),
      "Couldn't save items"
    );
    created.forEach((it) => get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "created" }));
    return created;
  },

  updateItem: (itemId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const normalizedPatch = patch.quantity !== undefined ? { ...patch, quantity: clampQuantity(patch.quantity) } : patch;
    const nextQuantity = normalizedPatch.quantity ?? previous.quantity;
    const nextMinQuantity = normalizedPatch.minQuantity !== undefined ? normalizedPatch.minQuantity : previous.minQuantity;
    const wasLow = previous.minQuantity !== null && previous.quantity <= previous.minQuantity;
    const timestamp = nowIso();
    const merged: Item = {
      ...previous,
      ...normalizedPatch,
      lowStockSince: deriveLowStockSince(wasLow, previous.lowStockSince, nextQuantity, nextMinQuantity, timestamp),
      updatedAt: timestamp,
    };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)) }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't update item"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "edited" });
  },

  moveItem: (itemId, dest) => {
    const supabase = getSupabaseBrowserClient();
    const { locations, containers } = get();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const merged: Item = { ...previous, locationId: dest.locationId, containerId: dest.containerId, updatedAt: nowIso() };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)), lastUsedDestination: dest }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't move item"
    );
    // "From X to Y", not the breadcrumb's own "→" separator (buildBreadcrumb's
    // own segments already join with "→" — reusing it here for the from/to
    // pair too would read as one ambiguous chain instead of two places) — so
    // the item's Activity/History section actually says where it came from
    // and went to, not just the bare verb "moved" ActivityRow already shows.
    const fromLabel = breadcrumbLabel(buildBreadcrumb(previous.locationId, previous.containerId, locations, containers));
    const toLabel = breadcrumbLabel(buildBreadcrumb(dest.locationId, dest.containerId, locations, containers));
    get().logActivity({
      entityType: "item",
      entityId: merged.id,
      entityName: merged.name,
      action: "moved",
      detail: fromLabel === toLabel ? undefined : `From ${fromLabel} to ${toLabel}`,
    });
  },

  archiveItem: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous || previous.status !== "active") return;
    const merged: Item = { ...previous, status: "archived", updatedAt: nowIso() };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)) }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't archive item"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "archived" });
  },

  unarchiveItem: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const merged: Item = { ...previous, status: "active", updatedAt: nowIso() };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)) }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't restore item"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "restored" });
  },

  trashItem: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: Item = { ...previous, status: "trashed", trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)), updatedAt: trashedAt };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)) }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't move item to trash"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "trashed" });
  },

  restoreItem: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const merged: Item = { ...previous, status: "active", trashedAt: null, permanentlyDeleteAfter: null, updatedAt: nowIso() };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)) }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't restore item"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "restored" });
  },

  permanentlyDeleteItem: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const it = get().items.find((i) => i.id === itemId);
    set((s) => ({ items: s.items.filter((i) => i.id !== itemId) }));
    persistOrRevert(
      supabase.from("items").delete().eq("id", itemId),
      () => { if (it) set((s) => ({ items: [...s.items, it] })); },
      "Couldn't permanently delete item"
    );
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "deleted_forever" });
  },

  createLocation: (input) => {
    const supabase = getSupabaseBrowserClient();
    const created: Location = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name: input.name,
      description: input.description,
      coverPhotoEmoji: input.coverPhotoEmoji ?? "📦",
      coverPhotoPath: null,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
    };
    set((s) => ({ locations: [...s.locations, created] }));
    persistOrRevert(
      supabase.from("locations").insert(locationToInsertRow(created)),
      () => set((s) => ({ locations: s.locations.filter((l) => l.id !== created.id) })),
      "Couldn't create location"
    );
    get().logActivity({ entityType: "location", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateLocation: (locationId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().locations.find((l) => l.id === locationId);
    if (!previous) return;
    const merged: Location = { ...previous, ...patch };
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? merged : l)) }));
    persistOrRevert(
      supabase.from("locations").update(locationToInsertRow(merged)).eq("id", locationId),
      () => set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? previous : l)) })),
      "Couldn't update location"
    );
  },

  trashLocation: (locationId) => {
    const supabase = getSupabaseBrowserClient();
    const state = get();
    const trashedAt = nowIso();
    const purge = purgeAfter(new Date(trashedAt));
    const containerIds = state.containers.filter((c) => c.locationId === locationId).map((c) => c.id);
    const itemIds = state.items.filter((it) => it.locationId === locationId).map((it) => it.id);
    const previousItems = state.items;
    const previousLocations = state.locations;
    const previousContainers = state.containers;

    set((s) => ({
      items: s.items.map((it) => (it.locationId === locationId ? { ...it, status: "trashed", trashedAt, permanentlyDeleteAfter: purge, updatedAt: trashedAt } : it)),
      locations: s.locations.map((l) => (l.id === locationId ? { ...l, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : l)),
      containers: s.containers.map((c) => (c.locationId === locationId ? { ...c, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : c)),
    }));

    const revert = () => set({ items: previousItems, locations: previousLocations, containers: previousContainers });
    persistOrRevert(
      (async () => {
        const { error: locError } = await supabase
          .from("locations")
          .update({ status: "trashed", trashed_at: trashedAt, permanently_delete_after: purge })
          .eq("id", locationId);
        if (locError) return { error: locError };
        if (containerIds.length > 0) {
          const { error: cError } = await supabase
            .from("containers")
            .update({ status: "trashed", trashed_at: trashedAt, permanently_delete_after: purge })
            .in("id", containerIds);
          if (cError) return { error: cError };
        }
        if (itemIds.length > 0) {
          const { error: iError } = await supabase
            .from("items")
            .update({ status: "trashed", trashed_at: trashedAt, permanently_delete_after: purge, updated_at: trashedAt })
            .in("id", itemIds);
          if (iError) return { error: iError };
        }
        return { error: null };
      })(),
      revert,
      "Couldn't move location to trash"
    );

    const loc = state.locations.find((l) => l.id === locationId);
    get().logActivity({ entityType: "location", entityId: locationId, entityName: loc?.name ?? "Location", action: "trashed" });
  },

  restoreLocation: (locationId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().locations.find((l) => l.id === locationId);
    if (!previous) return;
    set((s) => ({
      locations: s.locations.map((l) => (l.id === locationId ? { ...l, status: "active", trashedAt: null, permanentlyDeleteAfter: null } : l)),
    }));
    persistOrRevert(
      supabase.from("locations").update({ status: "active", trashed_at: null, permanently_delete_after: null }).eq("id", locationId),
      () => set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? previous : l)) })),
      "Couldn't restore location"
    );
    get().logActivity({ entityType: "location", entityId: previous.id, entityName: previous.name, action: "restored" });
  },

  permanentlyDeleteLocation: (locationId) => {
    const supabase = getSupabaseBrowserClient();
    const loc = get().locations.find((l) => l.id === locationId);
    set((s) => ({ locations: s.locations.filter((l) => l.id !== locationId) }));
    persistOrRevert(
      supabase.from("locations").delete().eq("id", locationId),
      () => { if (loc) set((s) => ({ locations: [...s.locations, loc] })); },
      "Couldn't permanently delete location"
    );
    if (loc) get().logActivity({ entityType: "location", entityId: loc.id, entityName: loc.name, action: "deleted_forever" });
  },

  setLocationCoverPhoto: async (locationId, file) => {
    const location = get().locations.find((l) => l.id === locationId);
    if (!location) return { ok: false, error: "Location not found." };
    const previousPath = location.coverPhotoPath;

    const uploaded = await uploadCoverPhotoFile(file, location.householdId);
    if (!uploaded.ok) return uploaded;
    const { path } = uploaded;

    const supabase = getSupabaseBrowserClient();
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: path } : l)) }));
    const { error: updateError } = await supabase.from("locations").update({ cover_photo_path: path }).eq("id", locationId);
    if (updateError) {
      set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: previousPath } : l)) }));
      removeCoverPhotoObject(path, "location cover photo upload");
      return { ok: false, error: updateError.message };
    }
    if (previousPath) removeCoverPhotoObject(previousPath, "replaced location cover photo");
    return { ok: true };
  },

  generateLocationCoverPhoto: async (locationId, input) => {
    const location = get().locations.find((l) => l.id === locationId);
    if (!location) return { ok: false, error: "Location not found." };
    const previousPath = location.coverPhotoPath;

    const generated = await generateCoverPhotoViaAI(locationId, location.householdId, input.roomType, input.detail ?? "");
    if (!generated.ok) return generated;
    const { path } = generated;

    // Same optimistic-set/write-DB/revert-on-failure/old-photo-cleanup
    // order as setLocationCoverPhoto above — the generated image is
    // already sitting in Storage at this point (the API route uploaded
    // it), this just points the location row at it.
    const supabase = getSupabaseBrowserClient();
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: path } : l)) }));
    const { error: updateError } = await supabase.from("locations").update({ cover_photo_path: path }).eq("id", locationId);
    if (updateError) {
      set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: previousPath } : l)) }));
      removeCoverPhotoObject(path, "generated location cover photo");
      return { ok: false, error: updateError.message };
    }
    if (previousPath) removeCoverPhotoObject(previousPath, "replaced location cover photo");
    return { ok: true };
  },

  removeLocationCoverPhoto: (locationId) => {
    const supabase = getSupabaseBrowserClient();
    const location = get().locations.find((l) => l.id === locationId);
    if (!location || !location.coverPhotoPath) return;
    const previousPath = location.coverPhotoPath;
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: null } : l)) }));
    removeCoverPhotoObject(previousPath, "location cover photo");
    persistOrRevert(
      supabase.from("locations").update({ cover_photo_path: null }).eq("id", locationId),
      () => set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, coverPhotoPath: previousPath } : l)) })),
      "Couldn't remove cover photo"
    );
  },

  createContainer: (input) => {
    const supabase = getSupabaseBrowserClient();
    // Every new container gets a real Container ID immediately — no
    // separate "Assign Container ID" step required before it's print-
    // ready. Computed locally (same nextDisplayCode() the manual/print-
    // time auto-assign paths already use), not a separate awaited
    // round-trip: createContainer is synchronous everywhere it's called
    // (many call sites use the returned Container right away), and this
    // stays consistent with that rather than becoming the one path that
    // blocks on a uniqueness check first. The household's own
    // (household_id, display_code) unique constraint still backstops a
    // genuine race (two containers created in the same location at the
    // same instant) — an exceedingly rare case that would surface as a
    // reverted "Couldn't create container" via persistOrRevert below,
    // same as any other insert conflict this action could already hit.
    const locationName = get().locations.find((l) => l.id === input.locationId)?.name ?? "BIN";
    const created: Container = {
      id: newId(),
      householdId: get().currentHouseholdId,
      locationId: input.locationId,
      parentContainerId: input.parentContainerId ?? null,
      name: input.name,
      description: input.description,
      tagToken: tagToken(),
      displayCode: nextDisplayCode(get().containers, locationName),
      coverPhotoEmoji: input.coverPhotoEmoji ?? "📦",
      coverPhotoPath: null,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
      nfcLinkedAt: null,
    };
    set((s) => ({ containers: [...s.containers, created] }));
    persistOrRevert(
      supabase.from("containers").insert(containerToInsertRow(created)),
      () => set((s) => ({ containers: s.containers.filter((c) => c.id !== created.id) })),
      "Couldn't create container"
    );
    get().logActivity({ entityType: "container", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateContainer: (containerId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().containers.find((c) => c.id === containerId);
    if (!previous) return;
    const merged: Container = { ...previous, ...patch };
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? merged : c)) }));
    persistOrRevert(
      supabase.from("containers").update(containerToInsertRow(merged)).eq("id", containerId),
      () => set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? previous : c)) })),
      "Couldn't update container"
    );
  },

  moveContainer: (containerId, dest) => {
    // Local optimistic cascade mirrors cascade_container_location() (the
    // real DB trigger) exactly — already verified against it in an
    // earlier stage. Only the moved container itself needs a client
    // write: the trigger cascades to descendant containers and items on
    // the server side by itself (it re-fires on each child's own
    // location_id update), so persisting a single row is enough.
    const supabase = getSupabaseBrowserClient();
    const state = get();
    const previous = state.containers.find((c) => c.id === containerId);
    if (!previous) return;
    const previousItems = state.items;
    const previousContainers = state.containers;
    const descendantIds = new Set(collectDescendantContainerIds(state.containers, containerId));

    set((s) => ({
      containers: s.containers.map((c) =>
        c.id === containerId
          ? { ...c, locationId: dest.locationId, parentContainerId: dest.parentContainerId }
          : descendantIds.has(c.id)
            ? { ...c, locationId: dest.locationId }
            : c
      ),
      items: s.items.map((it) =>
        it.containerId && (it.containerId === containerId || descendantIds.has(it.containerId))
          ? { ...it, locationId: dest.locationId, updatedAt: nowIso() }
          : it
      ),
    }));

    persistOrRevert(
      supabase.from("containers").update({ location_id: dest.locationId, parent_container_id: dest.parentContainerId }).eq("id", containerId),
      () => set({ items: previousItems, containers: previousContainers }),
      "Couldn't move container"
    );
    get().logActivity({ entityType: "container", entityId: previous.id, entityName: previous.name, action: "moved" });
  },

  trashContainer: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const state = get();
    const trashedAt = nowIso();
    const purge = purgeAfter(new Date(trashedAt));
    const descendantIds = collectDescendantContainerIds(state.containers, containerId);
    const allIds = [containerId, ...descendantIds];
    const allIdSet = new Set(allIds);
    const itemIds = state.items.filter((it) => it.containerId && allIdSet.has(it.containerId)).map((it) => it.id);
    const name = state.containers.find((c) => c.id === containerId)?.name ?? "Container";
    const previousItems = state.items;
    const previousContainers = state.containers;

    set((s) => ({
      items: s.items.map((it) => (it.containerId && allIdSet.has(it.containerId) ? { ...it, status: "trashed", trashedAt, permanentlyDeleteAfter: purge, updatedAt: trashedAt } : it)),
      containers: s.containers.map((c) => (allIdSet.has(c.id) ? { ...c, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : c)),
    }));

    persistOrRevert(
      (async () => {
        const { error: cError } = await supabase
          .from("containers")
          .update({ status: "trashed", trashed_at: trashedAt, permanently_delete_after: purge })
          .in("id", allIds);
        if (cError) return { error: cError };
        if (itemIds.length > 0) {
          const { error: iError } = await supabase
            .from("items")
            .update({ status: "trashed", trashed_at: trashedAt, permanently_delete_after: purge, updated_at: trashedAt })
            .in("id", itemIds);
          if (iError) return { error: iError };
        }
        return { error: null };
      })(),
      () => set({ items: previousItems, containers: previousContainers }),
      "Couldn't move container to trash"
    );
    get().logActivity({ entityType: "container", entityId: containerId, entityName: name, action: "trashed" });
  },

  restoreContainer: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().containers.find((c) => c.id === containerId);
    if (!previous) return;
    set((s) => ({
      containers: s.containers.map((c) => (c.id === containerId ? { ...c, status: "active", trashedAt: null, permanentlyDeleteAfter: null } : c)),
    }));
    persistOrRevert(
      supabase.from("containers").update({ status: "active", trashed_at: null, permanently_delete_after: null }).eq("id", containerId),
      () => set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? previous : c)) })),
      "Couldn't restore container"
    );
    get().logActivity({ entityType: "container", entityId: previous.id, entityName: previous.name, action: "restored" });
  },

  permanentlyDeleteContainer: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const c = get().containers.find((c) => c.id === containerId);
    set((s) => ({ containers: s.containers.filter((c) => c.id !== containerId) }));
    persistOrRevert(
      supabase.from("containers").delete().eq("id", containerId),
      () => { if (c) set((s) => ({ containers: [...s.containers, c] })); },
      "Couldn't permanently delete container"
    );
    if (c) get().logActivity({ entityType: "container", entityId: c.id, entityName: c.name, action: "deleted_forever" });
  },

  setContainerCoverPhoto: async (containerId, file) => {
    const container = get().containers.find((c) => c.id === containerId);
    if (!container) return { ok: false, error: "Container not found." };
    const previousPath = container.coverPhotoPath;

    const uploaded = await uploadCoverPhotoFile(file, container.householdId);
    if (!uploaded.ok) return uploaded;
    const { path } = uploaded;

    const supabase = getSupabaseBrowserClient();
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, coverPhotoPath: path } : c)) }));
    const { error: updateError } = await supabase.from("containers").update({ cover_photo_path: path }).eq("id", containerId);
    if (updateError) {
      set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, coverPhotoPath: previousPath } : c)) }));
      removeCoverPhotoObject(path, "container cover photo upload");
      return { ok: false, error: updateError.message };
    }
    if (previousPath) removeCoverPhotoObject(previousPath, "replaced container cover photo");
    return { ok: true };
  },

  removeContainerCoverPhoto: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const container = get().containers.find((c) => c.id === containerId);
    if (!container || !container.coverPhotoPath) return;
    const previousPath = container.coverPhotoPath;
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, coverPhotoPath: null } : c)) }));
    removeCoverPhotoObject(previousPath, "container cover photo");
    persistOrRevert(
      supabase.from("containers").update({ cover_photo_path: null }).eq("id", containerId),
      () => set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, coverPhotoPath: previousPath } : c)) })),
      "Couldn't remove cover photo"
    );
  },

  assignDisplayCode: async (containerId, code) => {
    const supabase = getSupabaseBrowserClient();
    const container = get().containers.find((c) => c.id === containerId);
    if (!container) return { ok: false, error: "Container not found." };
    const location = get().locations.find((l) => l.id === container.locationId);
    const isExplicit = !!(code && code.trim());

    for (let attempt = 0; attempt < 5; attempt++) {
      let resolved: string;
      if (isExplicit) {
        resolved = normalizeDisplayCode(code!);
        if (isDisplayCodeTaken(get().containers, resolved, containerId)) {
          return { ok: false, error: `Container ID "${resolved}" is already in use.` };
        }
      } else {
        resolved = nextDisplayCode(get().containers, location?.name ?? "BIN");
      }

      // .select() so a 0-row update (not an error — just no matching id)
      // is distinguishable from a real success. That happens when this
      // runs right after createContainer(), whose own insert is
      // fire-and-forget and may not have landed on the server yet.
      const { data, error } = await supabase.from("containers").update({ display_code: resolved }).eq("id", containerId).select("id");
      if (!error && data && data.length > 0) {
        set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, displayCode: resolved } : c)) }));
        get().logActivity({ entityType: "container", entityId: containerId, entityName: container.name, action: "edited", detail: `Container ID set to ${resolved}` });
        return { ok: true, code: resolved };
      }
      if (!error) {
        // 0 rows affected — the container's own insert hasn't propagated
        // yet. Not a conflict, just not there yet; brief backoff and retry.
        await new Promise((r) => setTimeout(r, 200));
        continue;
      }
      // 23505 = unique_violation on (household_id, display_code). Only
      // worth retrying on the auto-generate path — an explicit user-typed
      // code was already checked above and would just collide again
      // identically. Refetch this location's containers first: our local
      // list is what raced us into the conflict in the first place.
      if (error.code !== "23505" || isExplicit) {
        return { ok: false, error: error.message };
      }
      const { data: fresh } = await supabase.from("containers").select("*").eq("location_id", container.locationId);
      if (fresh) {
        const freshContainers = (fresh as ContainerRow[]).map(rowToContainer);
        set((s) => ({ containers: s.containers.map((c) => freshContainers.find((f) => f.id === c.id) ?? c) }));
      }
    }
    return { ok: false, error: "Couldn't assign a Container ID after a few attempts — try again." };
  },

  linkNfcTag: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const container = get().containers.find((c) => c.id === containerId);
    if (!container) return;
    const linkedAt = nowIso();
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, nfcLinkedAt: linkedAt } : c)) }));
    persistOrRevert(
      supabase.from("containers").update({ nfc_linked_at: linkedAt }).eq("id", containerId),
      () => set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, nfcLinkedAt: container.nfcLinkedAt } : c)) })),
      "Couldn't link NFC tag"
    );
    get().logActivity({ entityType: "container", entityId: containerId, entityName: container.name, action: "edited", detail: "NFC tag linked" });
  },

  unlinkNfcTag: (containerId) => {
    const supabase = getSupabaseBrowserClient();
    const container = get().containers.find((c) => c.id === containerId);
    if (!container || !container.nfcLinkedAt) return;
    const previousLinkedAt = container.nfcLinkedAt;
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, nfcLinkedAt: null } : c)) }));
    persistOrRevert(
      supabase.from("containers").update({ nfc_linked_at: null }).eq("id", containerId),
      () => set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, nfcLinkedAt: previousLinkedAt } : c)) })),
      "Couldn't unlink NFC tag"
    );
    get().logActivity({ entityType: "container", entityId: containerId, entityName: container.name, action: "edited", detail: "NFC tag unlinked" });
  },

  setItemCoverPhoto: async (itemId, file) => {
    const item = get().items.find((it) => it.id === itemId);
    if (!item) return { ok: false, error: "Item not found." };
    const previousPath = item.coverPhotoPath;

    const uploaded = await uploadCoverPhotoFile(file, item.householdId);
    if (!uploaded.ok) return uploaded;
    const { path } = uploaded;

    const supabase = getSupabaseBrowserClient();
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? { ...it, coverPhotoPath: path } : it)) }));
    const { error: updateError } = await supabase.from("items").update({ cover_photo_path: path }).eq("id", itemId);
    if (updateError) {
      set((s) => ({ items: s.items.map((it) => (it.id === itemId ? { ...it, coverPhotoPath: previousPath } : it)) }));
      removeCoverPhotoObject(path, "item cover photo upload");
      return { ok: false, error: updateError.message };
    }
    if (previousPath) removeCoverPhotoObject(previousPath, "replaced item cover photo");
    return { ok: true };
  },

  removeItemCoverPhoto: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const item = get().items.find((it) => it.id === itemId);
    if (!item || !item.coverPhotoPath) return;
    const previousPath = item.coverPhotoPath;
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? { ...it, coverPhotoPath: null } : it)) }));
    removeCoverPhotoObject(previousPath, "item cover photo");
    persistOrRevert(
      supabase.from("items").update({ cover_photo_path: null }).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? { ...it, coverPhotoPath: previousPath } : it)) })),
      "Couldn't remove cover photo"
    );
  },

  addAttachment: async (itemId, input) => {
    const { file } = input;
    const contentType = file.type || "application/octet-stream";
    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      return { ok: false, error: `File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.` };
    }
    if (!isAttachmentTypeAllowed(contentType)) {
      return { ok: false, error: "Only images and PDFs can be attached." };
    }

    const supabase = getSupabaseBrowserClient();
    const householdId = get().currentHouseholdId;
    const attachmentId = newId();
    const storagePath = `${householdId}/${attachmentId}`;

    const { error: uploadError } = await supabase.storage.from("attachments").upload(storagePath, file, { contentType });
    if (uploadError) return { ok: false, error: uploadError.message };

    const created: Attachment = {
      id: attachmentId,
      householdId,
      itemId,
      kind: input.kind,
      fileName: file.name,
      storagePath,
      contentType,
      sizeBytes: file.size,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };

    const { error: insertError } = await supabase.from("attachments").insert(attachmentToInsertRow(created));
    if (insertError) {
      // Don't leave an orphaned object behind for a row that doesn't exist.
      await supabase.storage.from("attachments").remove([storagePath]);
      return { ok: false, error: insertError.message };
    }

    set((s) => ({ attachments: [...s.attachments, created] }));
    return { ok: true, attachment: created };
  },

  deleteAttachment: (attachmentId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().attachments.find((a) => a.id === attachmentId);
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== attachmentId) }));
    if (!previous) return;
    // Storage cleanup failing alone isn't rolled back over — worst case is
    // an orphaned object, not a functional problem — but a failed row
    // delete restores the attachment locally, matching every other revert.
    supabase.storage.from("attachments").remove([previous.storagePath]).then(({ error }) => {
      if (error) console.error("Failed to remove attachment from storage:", error.message);
    });
    persistOrRevert(
      supabase.from("attachments").delete().eq("id", attachmentId),
      () => set((s) => ({ attachments: [...s.attachments, previous] })),
      "Couldn't delete attachment"
    );
  },

  findApplianceDocuments: async (itemId) => {
    const state = get();
    const item = state.items.find((it) => it.id === itemId);
    if (!item) return { ok: false, error: "Item not found." };
    const manufacturer = item.extraDetails.manufacturer?.trim();
    const modelNumber = item.extraDetails.modelNumber?.trim();
    if (!manufacturer || !modelNumber) {
      return { ok: false, error: "Set a manufacturer and model number first." };
    }

    let suggestion: { manualUrl: string | null; manualLabel: string; warrantyUrl: string | null; warrantyLabel: string };
    try {
      const res = await fetch("/api/v1/vision/suggest-appliance-documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manufacturer, modelNumber }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return { ok: false, error: body?.error ?? `Couldn't look up documents (${res.status}).` };
      }
      ({ suggestion } = await res.json());
    } catch {
      return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
    }

    const timestamp = nowIso();
    const householdId = item.householdId;
    const newLinks: ItemDocumentLink[] = [];
    if (suggestion.manualUrl) {
      newLinks.push({ id: newId(), householdId, itemId, kind: "manual", url: suggestion.manualUrl, label: suggestion.manualLabel || "Manual", createdAt: timestamp });
    }
    if (suggestion.warrantyUrl) {
      newLinks.push({ id: newId(), householdId, itemId, kind: "warranty", url: suggestion.warrantyUrl, label: suggestion.warrantyLabel || "Warranty", createdAt: timestamp });
    }

    const supabase = getSupabaseBrowserClient();
    // Regenerating replaces rather than accumulates — a stale suggestion
    // sitting alongside a fresh one for the same kind would just be
    // confusing, and there's nothing worth keeping from the old guess once
    // a new one's been asked for.
    const staleIds = state.itemDocumentLinks.filter((l) => l.itemId === itemId).map((l) => l.id);
    set((s) => ({ itemDocumentLinks: [...s.itemDocumentLinks.filter((l) => l.itemId !== itemId), ...newLinks] }));

    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from("item_document_links").delete().in("id", staleIds);
      if (deleteError) console.error("Couldn't clear previous document suggestions:", deleteError.message);
    }
    if (newLinks.length > 0) {
      const { error: insertError } = await supabase.from("item_document_links").insert(newLinks.map(itemDocumentLinkToInsertRow));
      if (insertError) {
        set((s) => ({ itemDocumentLinks: s.itemDocumentLinks.filter((l) => !newLinks.some((n) => n.id === l.id)) }));
        return { ok: false, error: insertError.message };
      }
    }
    return { ok: true, count: newLinks.length };
  },

  deleteItemDocumentLink: (linkId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().itemDocumentLinks.find((l) => l.id === linkId);
    set((s) => ({ itemDocumentLinks: s.itemDocumentLinks.filter((l) => l.id !== linkId) }));
    if (!previous) return;
    persistOrRevert(
      supabase.from("item_document_links").delete().eq("id", linkId),
      () => set((s) => ({ itemDocumentLinks: [...s.itemDocumentLinks, previous] })),
      "Couldn't remove that suggestion"
    );
  },

  createPinnedLocation: async (input) => {
    const supabase = getSupabaseBrowserClient();
    const householdId = get().currentHouseholdId;
    const id = newId();

    let photoPath: string | null = null;
    if (input.photoFile) {
      const uploaded = await uploadPinnedLocationPhoto(input.photoFile, householdId, id);
      if (!uploaded.ok) return uploaded;
      photoPath = uploaded.path;
    }

    const created: PinnedLocation = {
      id,
      householdId,
      name: input.name,
      category: input.category,
      photoPath,
      locationNote: input.locationNote?.trim() || null,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };

    const { error: insertError } = await supabase.from("pinned_locations").insert(pinnedLocationToInsertRow(created));
    if (insertError) {
      if (photoPath) removePinnedLocationPhotoObject(photoPath, "pinned location create");
      return { ok: false, error: insertError.message };
    }

    set((s) => ({ pinnedLocations: [...s.pinnedLocations, created] }));
    return { ok: true, pinnedLocation: created };
  },

  updatePinnedLocation: async (pinnedLocationId, patch) => {
    const previous = get().pinnedLocations.find((p) => p.id === pinnedLocationId);
    if (!previous) return { ok: false, error: "Pinned location not found." };
    const supabase = getSupabaseBrowserClient();

    // A replacement upload now lands at its own fresh path (uploadPinnedLocationPhoto),
    // so — same safe order as setLocationCoverPhoto — the new photo goes up
    // and the DB row is written *before* the old object is ever deleted. A
    // failure at any point up through the DB write leaves the old photo
    // (and the row that still points at it) fully intact; only a *pure*
    // removal (no replacement upload) deletes the existing object, and even
    // then only after the row itself has already been updated to stop
    // referencing it.
    let photoPath = previous.photoPath;
    if (patch.photoFile) {
      const uploaded = await uploadPinnedLocationPhoto(patch.photoFile, previous.householdId, pinnedLocationId);
      if (!uploaded.ok) return uploaded;
      photoPath = uploaded.path;
    } else if (patch.removePhoto) {
      photoPath = null;
    }

    const merged: PinnedLocation = {
      ...previous,
      name: patch.name ?? previous.name,
      category: patch.category ?? previous.category,
      locationNote: patch.locationNote !== undefined ? (patch.locationNote?.trim() || null) : previous.locationNote,
      photoPath,
    };

    const { error: updateError } = await supabase.from("pinned_locations").update(pinnedLocationToInsertRow(merged)).eq("id", pinnedLocationId);
    if (updateError) {
      // The row write is what failed, not the upload — clean up the new
      // orphaned photo (if any) rather than leaving it dangling forever,
      // same as setLocationCoverPhoto's own failure branch.
      if (patch.photoFile && photoPath) removePinnedLocationPhotoObject(photoPath, "pinned location photo upload");
      return { ok: false, error: updateError.message };
    }

    set((s) => ({ pinnedLocations: s.pinnedLocations.map((p) => (p.id === pinnedLocationId ? merged : p)) }));
    // Only now, with the row durably pointing at the new state, is it safe
    // to delete whatever the *old* photo was (a replacement's previous
    // object, or a removed one) — the same object that reverting on
    // failure above would otherwise have needed to still be intact.
    if (previous.photoPath && previous.photoPath !== photoPath) {
      removePinnedLocationPhotoObject(previous.photoPath, "replaced or removed pinned location photo");
    }
    return { ok: true };
  },

  deletePinnedLocation: (pinnedLocationId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().pinnedLocations.find((p) => p.id === pinnedLocationId);
    set((s) => ({ pinnedLocations: s.pinnedLocations.filter((p) => p.id !== pinnedLocationId) }));
    if (!previous) return;
    if (previous.photoPath) removePinnedLocationPhotoObject(previous.photoPath, "pinned location delete");
    persistOrRevert(
      supabase.from("pinned_locations").delete().eq("id", pinnedLocationId),
      () => set((s) => ({ pinnedLocations: [...s.pinnedLocations, previous] })),
      "Couldn't delete pinned location"
    );
  },

  createLabelBatch: (input) => {
    const supabase = getSupabaseBrowserClient();
    const householdId = get().currentHouseholdId;
    const batch: LabelBatch = {
      id: newId(),
      householdId,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      paperPreset: input.paperPreset,
      toggle: input.toggle,
      includeLocation: input.includeLocation,
      offsetX: input.offsetX,
      offsetY: input.offsetY,
      status: "generated",
    };

    const containers = get().containers;
    const assignedEntries: LabelBatchEntry[] = input.containerIds
      .map((containerId) => containers.find((c) => c.id === containerId))
      .filter((c): c is Container => !!c)
      .map((c) => ({
        id: newId(),
        batchId: batch.id,
        householdId,
        containerId: c.id,
        tagToken: c.tagToken,
        displayCode: c.displayCode,
        status: "assigned" as const,
      }));

    const unassignedEntries: LabelBatchEntry[] = Array.from({ length: Math.max(0, input.unassignedCount) }, () => ({
      id: newId(),
      batchId: batch.id,
      householdId,
      containerId: null,
      tagToken: tagToken(),
      displayCode: null,
      status: "unassigned" as const,
    }));

    const entries = [...assignedEntries, ...unassignedEntries];
    set((s) => ({
      labelBatches: [batch, ...s.labelBatches],
      labelBatchEntries: [...s.labelBatchEntries, ...entries],
    }));
    persistOrRevert(
      (async () => {
        const { error } = await supabase.from("label_batches").insert(labelBatchToInsertRow(batch));
        if (error) return { error };
        if (entries.length > 0) {
          const { error: entriesError } = await supabase.from("label_batch_entries").insert(entries.map(labelBatchEntryToInsertRow));
          if (entriesError) return { error: entriesError };
        }
        return { error: null };
      })(),
      () =>
        set((s) => ({
          labelBatches: s.labelBatches.filter((b) => b.id !== batch.id),
          labelBatchEntries: s.labelBatchEntries.filter((e) => e.batchId !== batch.id),
        })),
      "Couldn't save label batch"
    );
    return { batch, entries };
  },

  claimUnassignedLabel: async (entryId, containerId) => {
    const entry = get().labelBatchEntries.find((e) => e.id === entryId);
    if (!entry) return { ok: false, error: "Label not found." };
    if (entry.containerId) return { ok: false, error: "This label is already assigned." };
    const container = get().containers.find((c) => c.id === containerId);
    if (!container) return { ok: false, error: "Container not found." };

    const location = get().locations.find((l) => l.id === container.locationId);
    const displayCode = entry.displayCode ?? container.displayCode ?? nextDisplayCode(get().containers, location?.name ?? "BIN");
    // A preprinted/unassigned label is claimed onto a container after the
    // physical label already exists — if its batch was already printed,
    // the entry jumps straight to 'printed' rather than sitting at
    // 'assigned' as if it were still waiting to go to the printer.
    const batch = get().labelBatches.find((b) => b.id === entry.batchId);
    const nextStatus = batch?.status === "printed" ? "printed" : "assigned";

    const supabase = getSupabaseBrowserClient();
    // Real conflict check — .select() so a 0-row update (someone else
    // already claimed this entry) is distinguishable from success.
    const { data, error } = await supabase
      .from("label_batch_entries")
      .update({ container_id: containerId, display_code: displayCode, status: nextStatus })
      .eq("id", entryId)
      .is("container_id", null)
      .select("id");
    if (error) return { ok: false, error: error.message };
    if (!data || data.length === 0) return { ok: false, error: "This label is already assigned." };

    const { error: containerError } = await supabase.from("containers").update({ tag_token: entry.tagToken, display_code: displayCode }).eq("id", containerId);
    if (containerError) return { ok: false, error: containerError.message };

    set((s) => ({
      containers: s.containers.map((c) => (c.id === containerId ? { ...c, tagToken: entry.tagToken, displayCode } : c)),
      labelBatchEntries: s.labelBatchEntries.map((e) =>
        e.id === entryId ? { ...e, containerId, displayCode, status: nextStatus } : e
      ),
    }));
    get().logActivity({
      entityType: "container",
      entityId: containerId,
      entityName: container.name,
      action: "edited",
      detail: `Preprinted label ${entry.tagToken} assigned`,
    });
    return { ok: true };
  },

  markLabelBatchPrinted: (batchId) => {
    const supabase = getSupabaseBrowserClient();
    const previousBatches = get().labelBatches;
    const previousEntries = get().labelBatchEntries;
    set((s) => ({
      labelBatches: s.labelBatches.map((b) => (b.id === batchId ? { ...b, status: "printed" } : b)),
      labelBatchEntries: s.labelBatchEntries.map((e) => (e.batchId === batchId ? { ...e, status: "printed" } : e)),
    }));
    persistOrRevert(
      (async () => {
        const { error } = await supabase.from("label_batches").update({ status: "printed" }).eq("id", batchId);
        if (error) return { error };
        return supabase.from("label_batch_entries").update({ status: "printed" }).eq("batch_id", batchId);
      })(),
      () => set({ labelBatches: previousBatches, labelBatchEntries: previousEntries }),
      "Couldn't mark batch printed"
    );
  },

  getOrCreateTag: (name) => {
    const existing = get().tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const supabase = getSupabaseBrowserClient();
    const created: Tag = { id: newId(), householdId: get().currentHouseholdId, name };
    set((s) => ({ tags: [...s.tags, created] }));
    persistOrRevert(
      supabase.from("tags").insert(tagToInsertRow(created)),
      () => set((s) => ({ tags: s.tags.filter((t) => t.id !== created.id) })),
      "Couldn't create tag"
    );
    return created;
  },

  createNote: (input) => {
    const supabase = getSupabaseBrowserClient();
    const now = nowIso();
    const created: Note = {
      id: newId(),
      householdId: get().currentHouseholdId,
      ownerUserId: get().currentUserId,
      title: input.title,
      content: input.content,
      isShared: input.isShared ?? false,
      pinned: false,
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ notes: [...s.notes, created] }));
    persistOrRevert(
      supabase.from("notes").insert(noteToInsertRow(created)),
      () => set((s) => ({ notes: s.notes.filter((n) => n.id !== created.id) })),
      "Couldn't create note"
    );
    get().logActivity({ entityType: "note", entityId: created.id, entityName: created.title || "Untitled note", action: "created" });
    return created;
  },

  updateNote: (noteId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().notes.find((n) => n.id === noteId);
    if (!previous) return;
    const merged: Note = { ...previous, ...patch, updatedAt: nowIso() };
    set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? merged : n)) }));
    persistOrRevert(
      supabase.from("notes").update(noteToInsertRow(merged)).eq("id", noteId),
      () => set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? previous : n)) })),
      "Couldn't update note"
    );
    // "edited" covers every field including the personal/shared toggle —
    // no dedicated shared/unshared action exists in ActivityAction, so the
    // visibility flip just gets a descriptive detail instead.
    if (patch.isShared !== undefined && patch.isShared !== previous.isShared) {
      get().logActivity({
        entityType: "note",
        entityId: merged.id,
        entityName: merged.title || "Untitled note",
        action: "edited",
        detail: patch.isShared ? "Shared with household" : "Made personal",
      });
    } else if (patch.title !== undefined || patch.content !== undefined) {
      get().logActivity({ entityType: "note", entityId: merged.id, entityName: merged.title || "Untitled note", action: "edited" });
    }
  },

  trashNote: (noteId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().notes.find((n) => n.id === noteId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: Note = { ...previous, status: "trashed", trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)), updatedAt: trashedAt };
    set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? merged : n)) }));
    persistOrRevert(
      supabase.from("notes").update(noteToInsertRow(merged)).eq("id", noteId),
      () => set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? previous : n)) })),
      "Couldn't move note to trash"
    );
    get().logActivity({ entityType: "note", entityId: merged.id, entityName: merged.title || "Untitled note", action: "trashed" });
  },

  restoreNote: (noteId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().notes.find((n) => n.id === noteId);
    if (!previous) return;
    const merged: Note = { ...previous, status: "active", trashedAt: null, permanentlyDeleteAfter: null, updatedAt: nowIso() };
    set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? merged : n)) }));
    persistOrRevert(
      supabase.from("notes").update(noteToInsertRow(merged)).eq("id", noteId),
      () => set((s) => ({ notes: s.notes.map((n) => (n.id === noteId ? previous : n)) })),
      "Couldn't restore note"
    );
    get().logActivity({ entityType: "note", entityId: merged.id, entityName: merged.title || "Untitled note", action: "restored" });
  },

  permanentlyDeleteNote: (noteId) => {
    const supabase = getSupabaseBrowserClient();
    const n = get().notes.find((x) => x.id === noteId);
    set((s) => ({ notes: s.notes.filter((x) => x.id !== noteId) }));
    persistOrRevert(
      supabase.from("notes").delete().eq("id", noteId),
      () => { if (n) set((s) => ({ notes: [...s.notes, n] })); },
      "Couldn't permanently delete note"
    );
    if (n) get().logActivity({ entityType: "note", entityId: n.id, entityName: n.title || "Untitled note", action: "deleted_forever" });
  },

  createTask: (input) => {
    const supabase = getSupabaseBrowserClient();
    const now = nowIso();
    const created: HouseholdTask = {
      id: newId(),
      householdId: get().currentHouseholdId,
      title: input.title,
      description: input.description ?? "",
      categoryId: input.categoryId,
      linkedEntityType: input.linkedEntityType ?? null,
      linkedEntityId: input.linkedEntityId ?? null,
      assignedToPersonId: input.assignedToPersonId ?? null,
      scheduleType: input.scheduleType,
      dueAt: input.dueAt,
      recurrenceRule: input.scheduleType === "recurring" ? (input.recurrenceRule ?? { freq: "days", interval: 1 }) : null,
      isActive: true,
      createdByUserId: get().currentUserId,
      createdAt: now,
      updatedAt: now,
      trashedAt: null,
      permanentlyDeleteAfter: null,
    };
    set((s) => ({ tasks: [...s.tasks, created] }));
    persistOrRevert(
      supabase.from("household_tasks").insert(householdTaskToInsertRow(created)),
      () => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== created.id) })),
      "Couldn't create task"
    );
    get().logActivity({ entityType: "household_task", entityId: created.id, entityName: created.title, action: "created" });
    return created;
  },

  updateTask: (taskId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().tasks.find((t) => t.id === taskId);
    if (!previous) return;
    const merged: HouseholdTask = { ...previous, ...patch, updatedAt: nowIso() };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? merged : t)) }));
    persistOrRevert(
      supabase.from("household_tasks").update(householdTaskToInsertRow(merged)).eq("id", taskId),
      () => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? previous : t)) })),
      "Couldn't update task"
    );
    get().logActivity({ entityType: "household_task", entityId: merged.id, entityName: merged.title, action: "edited" });
  },

  completeTask: (taskId, notes) => {
    const supabase = getSupabaseBrowserClient();
    const task = get().tasks.find((t) => t.id === taskId);
    if (!task) return;
    const completion: TaskCompletion = {
      id: newId(),
      householdId: task.householdId,
      taskId: task.id,
      dueAt: task.dueAt,
      completedAt: nowIso(),
      completedByUserId: get().currentUserId,
      notes: notes ?? null,
    };
    set((s) => ({ taskCompletions: [...s.taskCompletions, completion] }));
    persistOrRevert(
      supabase.from("task_completions").insert(taskCompletionToInsertRow(completion)),
      () => set((s) => ({ taskCompletions: s.taskCompletions.filter((c) => c.id !== completion.id) })),
      "Couldn't record completion"
    );

    // one_time: done for good (isActive false, stays in history via the
    // completion row above). recurring: never "done," just advances to
    // its next occurrence — same "the task IS the series" model
    // RecurringBill uses, just with a real completion log RecurringBill
    // never got.
    if (task.scheduleType === "one_time") {
      get().updateTask(taskId, { isActive: false });
    } else if (task.recurrenceRule) {
      get().updateTask(taskId, { dueAt: advanceTaskDueDate(task.dueAt, task.recurrenceRule) });
    }
    get().logActivity({ entityType: "household_task", entityId: task.id, entityName: task.title, action: "completed" });
  },

  trashTask: (taskId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().tasks.find((t) => t.id === taskId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: HouseholdTask = { ...previous, trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)), updatedAt: trashedAt };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? merged : t)) }));
    persistOrRevert(
      supabase.from("household_tasks").update(householdTaskToInsertRow(merged)).eq("id", taskId),
      () => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? previous : t)) })),
      "Couldn't move task to trash"
    );
    get().logActivity({ entityType: "household_task", entityId: merged.id, entityName: merged.title, action: "trashed" });
  },

  restoreTask: (taskId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().tasks.find((t) => t.id === taskId);
    if (!previous) return;
    const merged: HouseholdTask = { ...previous, trashedAt: null, permanentlyDeleteAfter: null, updatedAt: nowIso() };
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? merged : t)) }));
    persistOrRevert(
      supabase.from("household_tasks").update(householdTaskToInsertRow(merged)).eq("id", taskId),
      () => set((s) => ({ tasks: s.tasks.map((t) => (t.id === taskId ? previous : t)) })),
      "Couldn't restore task"
    );
    get().logActivity({ entityType: "household_task", entityId: merged.id, entityName: merged.title, action: "restored" });
  },

  permanentlyDeleteTask: (taskId) => {
    const supabase = getSupabaseBrowserClient();
    const t = get().tasks.find((x) => x.id === taskId);
    set((s) => ({ tasks: s.tasks.filter((x) => x.id !== taskId) }));
    persistOrRevert(
      supabase.from("household_tasks").delete().eq("id", taskId),
      () => { if (t) set((s) => ({ tasks: [...s.tasks, t] })); },
      "Couldn't permanently delete task"
    );
    if (t) get().logActivity({ entityType: "household_task", entityId: t.id, entityName: t.title, action: "deleted_forever" });
  },

  getOrCreateTaskCategory: (name) => {
    const existing = get().taskCategories.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const supabase = getSupabaseBrowserClient();
    const created: TaskCategoryRecord = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name,
      isDefault: false,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    set((s) => ({ taskCategories: [...s.taskCategories, created] }));
    persistOrRevert(
      supabase.from("task_categories").insert(taskCategoryToInsertRow(created)),
      () => set((s) => ({ taskCategories: s.taskCategories.filter((c) => c.id !== created.id) })),
      "Couldn't create category"
    );
    return created;
  },

  createSubtask: (taskId, title) => {
    const supabase = getSupabaseBrowserClient();
    const existingForTask = get().subtasks.filter((s) => s.taskId === taskId);
    const created: TaskSubtask = {
      id: newId(),
      householdId: get().currentHouseholdId,
      taskId,
      title,
      isCompleted: false,
      position: existingForTask.length,
      createdAt: nowIso(),
    };
    set((s) => ({ subtasks: [...s.subtasks, created] }));
    persistOrRevert(
      supabase.from("task_subtasks").insert(taskSubtaskToInsertRow(created)),
      () => set((s) => ({ subtasks: s.subtasks.filter((x) => x.id !== created.id) })),
      "Couldn't add subtask"
    );
    return created;
  },

  toggleSubtask: (subtaskId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().subtasks.find((s) => s.id === subtaskId);
    if (!previous) return;
    const merged: TaskSubtask = { ...previous, isCompleted: !previous.isCompleted };
    set((s) => ({ subtasks: s.subtasks.map((x) => (x.id === subtaskId ? merged : x)) }));
    persistOrRevert(
      supabase.from("task_subtasks").update(taskSubtaskToInsertRow(merged)).eq("id", subtaskId),
      () => set((s) => ({ subtasks: s.subtasks.map((x) => (x.id === subtaskId ? previous : x)) })),
      "Couldn't update subtask"
    );
  },

  deleteSubtask: (subtaskId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().subtasks.find((s) => s.id === subtaskId);
    set((s) => ({ subtasks: s.subtasks.filter((x) => x.id !== subtaskId) }));
    persistOrRevert(
      supabase.from("task_subtasks").delete().eq("id", subtaskId),
      () => { if (previous) set((s) => ({ subtasks: [...s.subtasks, previous] })); },
      "Couldn't delete subtask"
    );
  },

  findNormalizationRule: (rawName) => {
    const normalized = rawName.trim().toLowerCase();
    return get().normalizationRules.find((r) => r.rawPattern.toLowerCase() === normalized);
  },

  saveNormalizationRule: (rawPattern, canonicalName, category) => {
    const supabase = getSupabaseBrowserClient();
    const existing = get().normalizationRules.find((r) => r.rawPattern.toLowerCase() === rawPattern.toLowerCase());
    if (existing) {
      const merged: NormalizationRule = { ...existing, canonicalName, category, usageCount: existing.usageCount + 1, updatedAt: nowIso() };
      set((s) => ({ normalizationRules: s.normalizationRules.map((r) => (r.id === existing.id ? merged : r)) }));
      persistOrRevert(
        supabase.from("normalization_rules").update(normalizationRuleToInsertRow(merged)).eq("id", existing.id),
        () => set((s) => ({ normalizationRules: s.normalizationRules.map((r) => (r.id === existing.id ? existing : r)) })),
        "Couldn't save normalization rule"
      );
      return;
    }
    const created: NormalizationRule = {
      id: newId(),
      householdId: get().currentHouseholdId,
      rawPattern,
      canonicalName,
      category,
      source: "learned",
      usageCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    set((s) => ({ normalizationRules: [...s.normalizationRules, created] }));
    persistOrRevert(
      supabase.from("normalization_rules").insert(normalizationRuleToInsertRow(created)),
      () => set((s) => ({ normalizationRules: s.normalizationRules.filter((r) => r.id !== created.id) })),
      "Couldn't save normalization rule"
    );
  },

  // ---------------------------------------------------------------------
  // Finance — Accounts. current_balance is never written from here (see
  // accountToInsertRow) — it's trigger-owned server-side; the optimistic
  // local object below carries whatever the caller last saw (0 for a new
  // account) until Realtime's own update to `accounts` reconciles it,
  // same "optimistic feel, Realtime settles the authoritative number"
  // split the rest of this file already uses for anything server-derived.
  // ---------------------------------------------------------------------

  createAccount: (input) => {
    const supabase = getSupabaseBrowserClient();
    // Defense in depth, not the primary fix — AccountFormSheet already
    // normalizes before calling onSubmit (a real bug: liability accounts
    // created with a plain positive "amount owed" got counted as assets
    // in netWorth(), which just sums every account's currentBalance
    // trusting the sign is already correct). Applied again here so any
    // future caller of createAccount can't reintroduce the same bug —
    // idempotent either way, normalizeAccountBalance on an already-correct
    // negative value is a no-op.
    const normalizedBalance = normalizeAccountBalance(input.type, input.startingBalance ?? 0);
    const created: Account = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name: input.name,
      type: input.type,
      institutionName: input.institutionName ?? null,
      currentBalance: normalizedBalance,
      availableBalance: input.availableBalance ?? null,
      startingBalance: normalizedBalance,
      cardLastFour: input.cardLastFour ?? null,
      ownerUserId: input.ownerUserId ?? null,
      status: "active",
      openedAt: input.openedAt ?? null,
      trashedAt: null,
      permanentlyDeleteAfter: null,
      // Never set through this manual-create path — a Plaid-linked account
      // is only ever created by the server-side exchange-public-token
      // route (Bank Sync Addendum §5), which writes plaid_item_id/
      // plaid_account_id directly via the admin client.
      plaidItemId: null,
      plaidAccountId: null,
      createdByUserId: get().currentUserId,
    };
    set((s) => ({ accounts: [...s.accounts, created] }));
    persistOrRevert(
      supabase.from("accounts").insert(accountToInsertRow(created)),
      () => set((s) => ({ accounts: s.accounts.filter((a) => a.id !== created.id) })),
      "Couldn't save account"
    );
    get().logActivity({ entityType: "account", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateAccount: (accountId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().accounts.find((a) => a.id === accountId);
    if (!previous) return;
    const merged: Account = { ...previous, ...patch };
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? merged : a)) }));
    // plaid_item_id/plaid_account_id deliberately excluded from the update
    // payload — this action is only ever called from a user-initiated edit
    // (AccountFormSheet); Plaid linkage is exclusively server-managed, via
    // the admin client directly in exchange-public-token/disconnect's own
    // routes, never through this action. Real bug this used to have:
    // accountToInsertRow(merged) always resent whatever plaidItemId
    // happened to be in the client's local cache, even though nothing
    // about it had actually changed — accounts_validate_plaid_item
    // (0015_plaid_bank_sync.sql) fires on *any* update that touches that
    // column and rejects it if the id no longer resolves to a real
    // plaid_items row, which a disconnect (or any other cause of local
    // staleness — a missed realtime event, a stale household-switch
    // cache, etc.) leaves dangling. So an ordinary, unrelated edit (a
    // rename, a balance tweak) could fail with "Plaid item not found" —
    // confirmed live, reported as exactly that message — simply because
    // this action kept re-asserting a value it had no business touching
    // at all. Omitting the columns means the trigger's own `update of
    // plaid_item_id` scope never fires for a plain edit, regardless of
    // whether the cached value is stale.
    const updateRow: Partial<ReturnType<typeof accountToInsertRow>> = accountToInsertRow(merged);
    delete updateRow.plaid_item_id;
    delete updateRow.plaid_account_id;
    // Same reasoning — who created the account is set once and never
    // meant to change via a later edit.
    delete updateRow.created_by_user_id;
    persistOrRevert(
      supabase.from("accounts").update(updateRow).eq("id", accountId),
      () => set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? previous : a)) })),
      "Couldn't update account"
    );
    get().logActivity({ entityType: "account", entityId: merged.id, entityName: merged.name, action: "edited" });
  },

  trashAccount: (accountId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().accounts.find((a) => a.id === accountId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: Account = { ...previous, status: "trashed", trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)) };
    // Server-side, trashing an account cascades to its transactions
    // (accounts_cascade_trash_transactions trigger, 0010_finance_schema.sql)
    // — Realtime's own `transactions` subscription picks that up as a
    // batch of UPDATE events, not something this action re-derives locally.
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? merged : a)) }));
    persistOrRevert(
      supabase.from("accounts").update(accountToInsertRow(merged)).eq("id", accountId),
      () => set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? previous : a)) })),
      "Couldn't move account to trash"
    );
    get().logActivity({ entityType: "account", entityId: merged.id, entityName: merged.name, action: "trashed" });
  },

  restoreAccount: (accountId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().accounts.find((a) => a.id === accountId);
    if (!previous) return;
    const merged: Account = { ...previous, status: "active", trashedAt: null, permanentlyDeleteAfter: null };
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? merged : a)) }));
    persistOrRevert(
      supabase.from("accounts").update(accountToInsertRow(merged)).eq("id", accountId),
      () => set((s) => ({ accounts: s.accounts.map((a) => (a.id === accountId ? previous : a)) })),
      "Couldn't restore account"
    );
    get().logActivity({ entityType: "account", entityId: merged.id, entityName: merged.name, action: "restored" });
  },

  permanentlyDeleteAccount: (accountId) => {
    const supabase = getSupabaseBrowserClient();
    const a = get().accounts.find((x) => x.id === accountId);
    set((s) => ({ accounts: s.accounts.filter((x) => x.id !== accountId) }));
    persistOrRevert(
      supabase.from("accounts").delete().eq("id", accountId),
      () => { if (a) set((s) => ({ accounts: [...s.accounts, a] })); },
      "Couldn't permanently delete account"
    );
    if (a) get().logActivity({ entityType: "account", entityId: a.id, entityName: a.name, action: "deleted_forever" });
  },

  shareAccount: (accountId, withUserId) => {
    const supabase = getSupabaseBrowserClient();
    const created: FinanceAccountShare = {
      id: newId(),
      householdId: get().currentHouseholdId,
      accountId,
      sharedWithUserId: withUserId,
      sharedByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    set((s) => ({ financeAccountShares: [...s.financeAccountShares, created] }));
    persistOrRevert(
      supabase.from("finance_account_shares").insert(financeAccountShareToInsertRow(created)),
      () => set((s) => ({ financeAccountShares: s.financeAccountShares.filter((sh) => sh.id !== created.id) })),
      "Couldn't share account"
    );
  },

  unshareAccount: (accountId, withUserId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeAccountShares;
    set((s) => ({ financeAccountShares: s.financeAccountShares.filter((sh) => !(sh.accountId === accountId && sh.sharedWithUserId === withUserId)) }));
    persistOrRevert(
      supabase.from("finance_account_shares").delete().eq("account_id", accountId).eq("shared_with_user_id", withUserId),
      () => set({ financeAccountShares: previous }),
      "Couldn't revoke sharing"
    );
  },

  // ---------------------------------------------------------------------
  // Finance — Transactions
  // ---------------------------------------------------------------------

  createTransaction: (input) => {
    const supabase = getSupabaseBrowserClient();
    const timestamp = nowIso();
    const created: Transaction = {
      id: newId(),
      householdId: get().currentHouseholdId,
      accountId: input.accountId,
      occurredAt: input.occurredAt,
      postedAt: input.postedAt ?? null,
      amount: input.amount,
      type: input.type,
      categoryId: input.categoryId ?? null,
      merchant: input.merchant ?? null,
      description: input.description ?? null,
      notes: input.notes ?? "",
      status: input.status ?? "posted",
      excludedFromReports: input.excludedFromReports ?? false,
      linkedTransactionId: input.linkedTransactionId ?? null,
      source: input.source ?? "manual",
      importBatchId: input.importBatchId ?? null,
      createdByUserId: get().currentUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      trashedAt: null,
      permanentlyDeleteAfter: null,
      // This is the client-side manual/CSV/receipt-scan create path — a
      // Plaid-sourced transaction is only ever written server-side by the
      // sync route (Bank Sync Addendum §6), which inserts/adopts rows
      // directly via the admin client, not through this store method.
      plaidTransactionId: null,
      userEdited: false,
      merchantLogoUrl: null,
    };
    // Tag-style multi-category set (Categories Foundation workstream) —
    // deduped, and only actually written once the transaction row itself
    // has landed server-side (see the sequential await below): a
    // transaction_categories row FK's to transactions(id), so firing both
    // inserts concurrently (persistOrRevert's usual fire-and-forget shape)
    // would race the tag insert against the transaction insert.
    //
    // Falls back to [categoryId] when categoryIds isn't passed at all —
    // not just when it's an empty array — so every creation path that
    // predates this workstream (CSV import, receipt-scan confirm, refund
    // creation) and only ever sets categoryId still gets a matching
    // transaction_categories row automatically, instead of silently
    // having a categoryId with no tag behind it forever.
    const resolvedCategoryIds = input.categoryIds ?? (input.categoryId ? [input.categoryId] : []);
    const categoryTagRows: TransactionCategory[] = Array.from(new Set(resolvedCategoryIds)).map((categoryId) => ({
      id: newId(),
      householdId: created.householdId,
      transactionId: created.id,
      categoryId,
      createdAt: timestamp,
    }));
    set((s) => ({
      transactions: [created, ...s.transactions],
      transactionCategories: [...s.transactionCategories, ...categoryTagRows],
    }));
    void (async () => {
      const { error } = await supabase.from("transactions").insert(transactionToInsertRow(created));
      if (error) {
        set((s) => ({
          transactions: s.transactions.filter((t) => t.id !== created.id),
          transactionCategories: s.transactionCategories.filter((tc) => tc.transactionId !== created.id),
        }));
        toast.error(`Couldn't save transaction: ${error.message}`);
        return;
      }
      if (categoryTagRows.length > 0) {
        const { error: tagError } = await supabase.from("transaction_categories").insert(categoryTagRows.map(transactionCategoryToInsertRow));
        if (tagError) {
          set((s) => ({ transactionCategories: s.transactionCategories.filter((tc) => tc.transactionId !== created.id) }));
          toast.error(`Transaction saved, but couldn't save its categories: ${tagError.message}`);
        }
      }
    })();
    get().logActivity({ entityType: "transaction", entityId: created.id, entityName: created.merchant ?? created.description ?? "Transaction", action: "created" });
    return created;
  },

  createLinkedTransactionPair: (input) => {
    const supabase = getSupabaseBrowserClient();
    const timestamp = nowIso();
    const fromId = newId();
    const toId = newId();
    const fromTxn: Transaction = {
      id: fromId,
      householdId: get().currentHouseholdId,
      accountId: input.fromAccountId,
      occurredAt: input.occurredAt,
      postedAt: null,
      amount: -Math.abs(input.amount),
      type: input.type,
      categoryId: null,
      merchant: input.merchant ?? null,
      description: input.description ?? null,
      notes: "",
      status: "posted",
      excludedFromReports: false,
      linkedTransactionId: toId,
      source: "manual",
      importBatchId: null,
      createdByUserId: get().currentUserId,
      createdAt: timestamp,
      updatedAt: timestamp,
      trashedAt: null,
      permanentlyDeleteAfter: null,
      plaidTransactionId: null,
      userEdited: false,
      merchantLogoUrl: null,
    };
    const toTxn: Transaction = {
      ...fromTxn,
      id: toId,
      accountId: input.toAccountId,
      amount: Math.abs(input.amount),
      linkedTransactionId: fromId,
    };
    set((s) => ({ transactions: [fromTxn, toTxn, ...s.transactions] }));
    persistOrRevert(
      supabase.from("transactions").insert([transactionToInsertRow(fromTxn), transactionToInsertRow(toTxn)]),
      () => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== fromId && t.id !== toId) })),
      "Couldn't save transfer"
    );
    get().logActivity({ entityType: "transaction", entityId: fromTxn.id, entityName: fromTxn.merchant ?? fromTxn.description ?? "Transfer", action: "created" });
    return { fromTxn, toTxn };
  },

  updateTransaction: (transactionId, patch) => {
    // categoryIds isn't a Transaction column — pulled out of the patch
    // before it touches anything Transaction-typed, and applied afterward
    // as a diff against transaction_categories (add what's newly selected,
    // remove what's no longer selected) rather than a blind replace.
    const { categoryIds, ...transactionPatch } = patch;
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactions.find((t) => t.id === transactionId);
    if (!previous) return;
    // Bank Sync Addendum §7 — any human edit to one of the fields a Plaid
    // `modified` sync would otherwise refresh flips userEdited so that
    // future sync event leaves it alone. Applied here, once, rather than
    // requiring every call site to remember it — a plain field-level
    // patch, not a dedicated action, is exactly how every other edit path
    // (transaction form, detail sheet inline edits) already calls this.
    const touchesProtectedField = ["categoryId", "merchant", "description", "notes"].some((k) => k in transactionPatch);
    const merged: Transaction = { ...previous, ...transactionPatch, userEdited: touchesProtectedField ? true : previous.userEdited, updatedAt: nowIso() };
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? merged : t)) }));
    // Not persistOrRevert here (unlike almost every other edit action in
    // this file): the categoryIds diff below has to run only once the
    // transaction row's own update has actually landed, not unconditionally
    // right after firing it — persistOrRevert's fire-and-forget shape gives
    // no way to sequence "then do this other thing on success," so this is
    // a directly-awaited async block instead, same idiom
    // permanentlyDeleteTransaction already uses for its own ordering need.
    void (async () => {
      const { error } = await supabase.from("transactions").update(transactionToInsertRow(merged)).eq("id", transactionId);
      if (error) {
        set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? previous : t)) }));
        toast.error(`Couldn't update transaction: ${error.message}`);
        return;
      }
      get().logActivity({ entityType: "transaction", entityId: merged.id, entityName: merged.merchant ?? merged.description ?? "Transaction", action: "edited" });

      if (categoryIds) {
        const desired = new Set(categoryIds);
        const existing = get().transactionCategories.filter((tc) => tc.transactionId === transactionId);
        const existingIds = new Set(existing.map((tc) => tc.categoryId));
        for (const categoryId of desired) {
          if (!existingIds.has(categoryId)) get().addTransactionCategory(transactionId, categoryId);
        }
        for (const tc of existing) {
          if (!desired.has(tc.categoryId)) get().removeTransactionCategory(transactionId, tc.categoryId);
        }
      }
    })();
  },

  trashTransaction: (transactionId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactions.find((t) => t.id === transactionId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: Transaction = { ...previous, trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)), updatedAt: trashedAt };
    // Server-side, trashing one leg of a linked transfer/payment pair
    // cascades to its counterpart (transactions_cascade_trash_linked
    // trigger) — Realtime picks that up as its own UPDATE event on the
    // other leg, not re-derived here.
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? merged : t)) }));
    persistOrRevert(
      supabase.from("transactions").update(transactionToInsertRow(merged)).eq("id", transactionId),
      () => set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? previous : t)) })),
      "Couldn't move transaction to trash"
    );
    get().logActivity({ entityType: "transaction", entityId: merged.id, entityName: merged.merchant ?? merged.description ?? "Transaction", action: "trashed" });
  },

  restoreTransaction: (transactionId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactions.find((t) => t.id === transactionId);
    if (!previous) return;
    const merged: Transaction = { ...previous, trashedAt: null, permanentlyDeleteAfter: null, updatedAt: nowIso() };
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? merged : t)) }));
    persistOrRevert(
      supabase.from("transactions").update(transactionToInsertRow(merged)).eq("id", transactionId),
      () => set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? previous : t)) })),
      "Couldn't restore transaction"
    );
    get().logActivity({ entityType: "transaction", entityId: merged.id, entityName: merged.merchant ?? merged.description ?? "Transaction", action: "restored" });
  },

  permanentlyDeleteTransaction: (transactionId) => {
    const supabase = getSupabaseBrowserClient();
    const t = get().transactions.find((x) => x.id === transactionId);
    // item_purchases_has_a_target (0017_household_ledger_core.sql) requires
    // at least one anchor to survive a write — the FK here is ON DELETE SET
    // NULL, so a purchase anchored only by this transaction (no
    // scanned_receipt_line_item_id) would otherwise violate that
    // constraint and fail the whole delete. Remove those links first, and
    // await it before the transaction delete fires — both are real
    // network calls with no ordering guarantee if fired fire-and-forget
    // alongside each other the way persistOrRevert normally would.
    const orphaned = get().itemPurchases.filter((p) => p.transactionId === transactionId && !p.scannedReceiptLineItemId);
    const orphanedIds = orphaned.map((p) => p.id);
    // transaction_categories has its own ON DELETE CASCADE (unlike
    // item_purchases' SET NULL above), so no separate unlink step is
    // needed server-side — this just keeps local state in sync with what
    // the cascade is about to do, rather than waiting on a Realtime DELETE
    // event per tag to catch up.
    const orphanedCategoryTags = get().transactionCategories.filter((tc) => tc.transactionId === transactionId);
    set((s) => ({
      transactions: s.transactions.filter((x) => x.id !== transactionId),
      itemPurchases: s.itemPurchases.filter((p) => !orphanedIds.includes(p.id)),
      transactionCategories: s.transactionCategories.filter((tc) => tc.transactionId !== transactionId),
    }));
    const revert = () => {
      if (t) set((s) => ({ transactions: [...s.transactions, t] }));
      if (orphaned.length) set((s) => ({ itemPurchases: [...s.itemPurchases, ...orphaned] }));
      if (orphanedCategoryTags.length) set((s) => ({ transactionCategories: [...s.transactionCategories, ...orphanedCategoryTags] }));
    };
    void (async () => {
      if (orphanedIds.length > 0) {
        const { error: unlinkError } = await supabase.from("item_purchases").delete().in("id", orphanedIds);
        if (unlinkError) {
          revert();
          toast.error(`Couldn't permanently delete transaction: ${unlinkError.message}`);
          return;
        }
      }
      const { error } = await supabase.from("transactions").delete().eq("id", transactionId);
      if (error) {
        revert();
        toast.error(`Couldn't permanently delete transaction: ${error.message}`);
      }
    })();
    if (t) get().logActivity({ entityType: "transaction", entityId: t.id, entityName: t.merchant ?? t.description ?? "Transaction", action: "deleted_forever" });
  },

  // ---------------------------------------------------------------------
  // Finance — Tag-style multi-category links (transaction_categories,
  // Categories Foundation workstream, 0024_transaction_categories.sql).
  // createTransaction/updateTransaction above call these (or the
  // equivalent inline logic) to stay in sync with their optional
  // categoryIds input — most callers won't reach for these two directly.
  // ---------------------------------------------------------------------

  addTransactionCategory: (transactionId, categoryId) => {
    const supabase = getSupabaseBrowserClient();
    // The DB's unique(transaction_id, category_id) constraint would reject
    // a duplicate anyway — checked here first just to skip the round trip.
    const already = get().transactionCategories.some((tc) => tc.transactionId === transactionId && tc.categoryId === categoryId);
    if (already) return;
    const created: TransactionCategory = {
      id: newId(),
      householdId: get().currentHouseholdId,
      transactionId,
      categoryId,
      createdAt: nowIso(),
    };
    set((s) => ({ transactionCategories: [...s.transactionCategories, created] }));
    persistOrRevert(
      supabase.from("transaction_categories").insert(transactionCategoryToInsertRow(created)),
      () => set((s) => ({ transactionCategories: s.transactionCategories.filter((tc) => tc.id !== created.id) })),
      "Couldn't tag category"
    );
    // Keep transactions.categoryId in sync — the documented "primary
    // category" invariant every legacy single-category call site
    // (dashboards, budget math, category_rules, the Ask tool) relies on.
    // Only backfills a missing primary; never overrides one that's
    // already set, so adding a second/third tag never bumps an existing
    // primary choice. Routed through updateTransaction (not a raw column
    // write) so this gets the same revert-on-failure and activity-log
    // behavior every other categoryId change already gets.
    const txn = get().transactions.find((t) => t.id === transactionId);
    if (txn && !txn.categoryId) {
      get().updateTransaction(transactionId, { categoryId });
    }
  },

  removeTransactionCategory: (transactionId, categoryId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactionCategories.find((tc) => tc.transactionId === transactionId && tc.categoryId === categoryId);
    if (!previous) return;
    set((s) => ({ transactionCategories: s.transactionCategories.filter((tc) => tc.id !== previous.id) }));
    persistOrRevert(
      supabase.from("transaction_categories").delete().eq("id", previous.id),
      () => set((s) => ({ transactionCategories: [...s.transactionCategories, previous] })),
      "Couldn't remove category tag"
    );
    // If the removed tag was the primary category, promote another
    // remaining tag to primary (or clear to null if none remain) — same
    // sync invariant as addTransactionCategory above. get() here already
    // reflects the set() above (Zustand updates are synchronous), so this
    // reads the post-removal tag list correctly.
    const txn = get().transactions.find((t) => t.id === transactionId);
    if (txn && txn.categoryId === categoryId) {
      const remaining = get().transactionCategories.filter((tc) => tc.transactionId === transactionId);
      get().updateTransaction(transactionId, { categoryId: remaining[0]?.categoryId ?? null });
    }
  },

  // ---------------------------------------------------------------------
  // Finance — Categories & rules
  // ---------------------------------------------------------------------

  createFinanceCategory: (input) => {
    const supabase = getSupabaseBrowserClient();
    const created: FinanceCategory = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name: input.name,
      parentCategoryId: input.parentCategoryId ?? null,
      isDefault: false,
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
    };
    set((s) => ({ financeCategories: [...s.financeCategories, created] }));
    persistOrRevert(
      supabase.from("categories").insert(financeCategoryToInsertRow(created)),
      () => set((s) => ({ financeCategories: s.financeCategories.filter((c) => c.id !== created.id) })),
      "Couldn't save category"
    );
    get().logActivity({ entityType: "category", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateFinanceCategory: (categoryId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeCategories.find((c) => c.id === categoryId);
    if (!previous) return;
    const merged: FinanceCategory = { ...previous, ...patch };
    set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? merged : c)) }));
    persistOrRevert(
      supabase.from("categories").update(financeCategoryToInsertRow(merged)).eq("id", categoryId),
      () => set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? previous : c)) })),
      "Couldn't update category"
    );
    get().logActivity({ entityType: "category", entityId: merged.id, entityName: merged.name, action: "edited" });
  },

  trashFinanceCategory: (categoryId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeCategories.find((c) => c.id === categoryId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: FinanceCategory = { ...previous, status: "trashed", trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)) };
    set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? merged : c)) }));
    // If any non-trashed transaction still references this category, the
    // DB-level prevent_trash_referenced_category() trigger (PRD §32.6)
    // rejects the write — persistOrRevert's normal error path reverts the
    // optimistic change and toasts it, no special-casing needed here.
    persistOrRevert(
      supabase.from("categories").update(financeCategoryToInsertRow(merged)).eq("id", categoryId),
      () => set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? previous : c)) })),
      "Couldn't trash category"
    );
    get().logActivity({ entityType: "category", entityId: merged.id, entityName: merged.name, action: "trashed" });
  },

  restoreFinanceCategory: (categoryId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeCategories.find((c) => c.id === categoryId);
    if (!previous) return;
    const merged: FinanceCategory = { ...previous, status: "active", trashedAt: null, permanentlyDeleteAfter: null };
    set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? merged : c)) }));
    persistOrRevert(
      supabase.from("categories").update(financeCategoryToInsertRow(merged)).eq("id", categoryId),
      () => set((s) => ({ financeCategories: s.financeCategories.map((c) => (c.id === categoryId ? previous : c)) })),
      "Couldn't restore category"
    );
    get().logActivity({ entityType: "category", entityId: merged.id, entityName: merged.name, action: "restored" });
  },

  createCategoryRule: (input) => {
    const supabase = getSupabaseBrowserClient();
    const created: CategoryRule = {
      id: newId(),
      householdId: get().currentHouseholdId,
      matchField: input.matchField,
      matchType: input.matchType ?? "contains",
      matchValue: input.matchValue,
      categoryId: input.categoryId,
      appliesFrom: nowIso(),
      createdAt: nowIso(),
    };
    set((s) => ({ categoryRules: [...s.categoryRules, created] }));
    persistOrRevert(
      supabase.from("category_rules").insert(categoryRuleToInsertRow(created)),
      () => set((s) => ({ categoryRules: s.categoryRules.filter((r) => r.id !== created.id) })),
      "Couldn't save rule"
    );
    return created;
  },

  deleteCategoryRule: (ruleId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().categoryRules;
    set((s) => ({ categoryRules: s.categoryRules.filter((r) => r.id !== ruleId) }));
    persistOrRevert(
      supabase.from("category_rules").delete().eq("id", ruleId),
      () => set({ categoryRules: previous }),
      "Couldn't delete rule"
    );
  },

  setCategoryBudget: (categoryId, monthlyAmount) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().categoryBudgets;
    // Reuses the existing row's own id when one already exists (rather
    // than always generating a fresh one) — the upsert below matches on
    // the household_id+category_id unique constraint, not id, but
    // sending a *different* id than what's already stored would still
    // try to overwrite the primary key on conflict, which is needless
    // risk when the correct id is already sitting right here locally.
    const existing = previous.find((b) => b.categoryId === categoryId);
    const timestamp = nowIso();
    const merged: CategoryBudget = existing
      ? { ...existing, monthlyAmount, updatedAt: timestamp }
      : { id: newId(), householdId: get().currentHouseholdId, categoryId, monthlyAmount, createdAt: timestamp, updatedAt: timestamp };
    set((s) => ({
      categoryBudgets: existing ? s.categoryBudgets.map((b) => (b.categoryId === categoryId ? merged : b)) : [...s.categoryBudgets, merged],
    }));
    persistOrRevert(
      supabase.from("category_budgets").upsert(categoryBudgetToInsertRow(merged), { onConflict: "household_id,category_id" }),
      () => set({ categoryBudgets: previous }),
      "Couldn't save budget"
    );
  },

  deleteCategoryBudget: (categoryId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().categoryBudgets;
    set((s) => ({ categoryBudgets: s.categoryBudgets.filter((b) => b.categoryId !== categoryId) }));
    persistOrRevert(
      supabase.from("category_budgets").delete().eq("category_id", categoryId).eq("household_id", get().currentHouseholdId),
      () => set({ categoryBudgets: previous }),
      "Couldn't remove budget"
    );
  },

  setTargetMonthlyIncome: (amount) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeSettings;
    const householdId = get().currentHouseholdId;
    const merged: FinanceSettings = { householdId, targetMonthlyIncome: amount, updatedAt: nowIso() };
    set({ financeSettings: merged });
    persistOrRevert(
      supabase.from("finance_settings").upsert(financeSettingsToInsertRow(merged), { onConflict: "household_id" }),
      () => set({ financeSettings: previous }),
      "Couldn't save target income"
    );
  },

  // ---------------------------------------------------------------------
  // Finance — Recurring bills (same owner_user_id privacy shape as Accounts)
  // ---------------------------------------------------------------------

  createRecurringBill: (input) => {
    const supabase = getSupabaseBrowserClient();
    const created: RecurringBill = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name: input.name,
      expectedAmount: input.expectedAmount,
      frequency: input.frequency,
      nextDueDate: input.nextDueDate,
      categoryId: input.categoryId ?? null,
      accountId: input.accountId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      isDebtPayment: input.isDebtPayment ?? false,
      isActive: true,
      trashedAt: null,
      permanentlyDeleteAfter: null,
    };
    set((s) => ({ recurringBills: [...s.recurringBills, created] }));
    persistOrRevert(
      supabase.from("recurring_bills").insert(recurringBillToInsertRow(created)),
      () => set((s) => ({ recurringBills: s.recurringBills.filter((b) => b.id !== created.id) })),
      "Couldn't save recurring bill"
    );
    get().logActivity({ entityType: "recurring_bill", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateRecurringBill: (billId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().recurringBills.find((b) => b.id === billId);
    if (!previous) return;
    const merged: RecurringBill = { ...previous, ...patch };
    set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? merged : b)) }));
    persistOrRevert(
      supabase.from("recurring_bills").update(recurringBillToInsertRow(merged)).eq("id", billId),
      () => set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? previous : b)) })),
      "Couldn't update recurring bill"
    );
    get().logActivity({ entityType: "recurring_bill", entityId: merged.id, entityName: merged.name, action: "edited" });
  },

  trashRecurringBill: (billId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().recurringBills.find((b) => b.id === billId);
    if (!previous) return;
    const trashedAt = nowIso();
    const merged: RecurringBill = { ...previous, trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)) };
    set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? merged : b)) }));
    persistOrRevert(
      supabase.from("recurring_bills").update(recurringBillToInsertRow(merged)).eq("id", billId),
      () => set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? previous : b)) })),
      "Couldn't move recurring bill to trash"
    );
    get().logActivity({ entityType: "recurring_bill", entityId: merged.id, entityName: merged.name, action: "trashed" });
  },

  restoreRecurringBill: (billId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().recurringBills.find((b) => b.id === billId);
    if (!previous) return;
    const merged: RecurringBill = { ...previous, trashedAt: null, permanentlyDeleteAfter: null };
    set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? merged : b)) }));
    persistOrRevert(
      supabase.from("recurring_bills").update(recurringBillToInsertRow(merged)).eq("id", billId),
      () => set((s) => ({ recurringBills: s.recurringBills.map((b) => (b.id === billId ? previous : b)) })),
      "Couldn't restore recurring bill"
    );
    get().logActivity({ entityType: "recurring_bill", entityId: merged.id, entityName: merged.name, action: "restored" });
  },

  permanentlyDeleteRecurringBill: (billId) => {
    const supabase = getSupabaseBrowserClient();
    const b = get().recurringBills.find((x) => x.id === billId);
    set((s) => ({ recurringBills: s.recurringBills.filter((x) => x.id !== billId) }));
    persistOrRevert(
      supabase.from("recurring_bills").delete().eq("id", billId),
      () => { if (b) set((s) => ({ recurringBills: [...s.recurringBills, b] })); },
      "Couldn't permanently delete recurring bill"
    );
    if (b) get().logActivity({ entityType: "recurring_bill", entityId: b.id, entityName: b.name, action: "deleted_forever" });
  },

  shareRecurringBill: (billId, withUserId) => {
    const supabase = getSupabaseBrowserClient();
    const created: FinanceBillShare = {
      id: newId(),
      householdId: get().currentHouseholdId,
      billId,
      sharedWithUserId: withUserId,
      sharedByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    set((s) => ({ financeBillShares: [...s.financeBillShares, created] }));
    persistOrRevert(
      supabase.from("finance_bill_shares").insert(financeBillShareToInsertRow(created)),
      () => set((s) => ({ financeBillShares: s.financeBillShares.filter((sh) => sh.id !== created.id) })),
      "Couldn't share recurring bill"
    );
  },

  unshareRecurringBill: (billId, withUserId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().financeBillShares;
    set((s) => ({ financeBillShares: s.financeBillShares.filter((sh) => !(sh.billId === billId && sh.sharedWithUserId === withUserId)) }));
    persistOrRevert(
      supabase.from("finance_bill_shares").delete().eq("bill_id", billId).eq("shared_with_user_id", withUserId),
      () => set({ financeBillShares: previous }),
      "Couldn't revoke sharing"
    );
  },

  dismissRecurringCandidate: (accountId, candidateKey) => {
    if (get().recurringCandidateDismissals.some((d) => d.accountId === accountId && d.candidateKey === candidateKey)) return;
    const supabase = getSupabaseBrowserClient();
    const created: RecurringCandidateDismissal = {
      id: newId(),
      householdId: get().currentHouseholdId,
      accountId,
      candidateKey,
      dismissedByUserId: get().currentUserId,
      dismissedAt: nowIso(),
    };
    set((s) => ({ recurringCandidateDismissals: [...s.recurringCandidateDismissals, created] }));
    persistOrRevert(
      supabase.from("recurring_candidate_dismissals").insert(recurringCandidateDismissalToInsertRow(created)),
      () => set((s) => ({ recurringCandidateDismissals: s.recurringCandidateDismissals.filter((d) => d.id !== created.id) })),
      "Couldn't dismiss suggestion"
    );
  },

  undismissRecurringCandidate: (accountId, candidateKey) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().recurringCandidateDismissals;
    set((s) => ({ recurringCandidateDismissals: s.recurringCandidateDismissals.filter((d) => !(d.accountId === accountId && d.candidateKey === candidateKey)) }));
    persistOrRevert(
      supabase.from("recurring_candidate_dismissals").delete().eq("account_id", accountId).eq("candidate_key", candidateKey),
      () => set({ recurringCandidateDismissals: previous }),
      "Couldn't undo dismissal"
    );
  },

  recordNetWorthSnapshot: () => {
    const supabase = getSupabaseBrowserClient();
    const today = new Date().toISOString().slice(0, 10);
    const activeAccounts = get().accounts.filter((a) => a.status === "active");
    if (activeAccounts.length === 0) return;
    const created: AccountBalanceSnapshot[] = activeAccounts.map((a) => ({
      id: newId(),
      accountId: a.id,
      balance: a.currentBalance,
      asOfDate: today,
      source: "manual",
      createdAt: nowIso(),
    }));
    set((s) => ({ accountBalanceSnapshots: [...s.accountBalanceSnapshots, ...created] }));
    persistOrRevert(
      supabase.from("account_balance_snapshots").insert(created.map(accountBalanceSnapshotToInsertRow)),
      () => set((s) => ({ accountBalanceSnapshots: s.accountBalanceSnapshots.filter((snap) => !created.some((c) => c.id === snap.id)) })),
      "Couldn't record snapshot"
    );
  },

  addTransactionAttachment: async (transactionId, input) => {
    const { file, sourceDraftId } = input;
    const contentType = file.type || "application/octet-stream";
    if (file.size > ATTACHMENT_MAX_SIZE_BYTES) {
      return { ok: false, error: `File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.` };
    }
    if (!isAttachmentTypeAllowed(contentType)) {
      return { ok: false, error: "Only images and PDFs can be attached." };
    }

    const supabase = getSupabaseBrowserClient();
    const householdId = get().currentHouseholdId;
    const attachmentId = newId();
    // Same private "attachments" bucket item attachments already use
    // (0011_receipt_scanning.sql's own comment on transaction_attachments)
    // — one more consumer of an already-generic household-scoped-path
    // Storage pattern, not a new bucket.
    const storagePath = `${householdId}/${attachmentId}`;

    const { error: uploadError } = await supabase.storage.from("attachments").upload(storagePath, file, { contentType });
    if (uploadError) return { ok: false, error: uploadError.message };

    const created: TransactionAttachment = {
      id: attachmentId,
      householdId,
      transactionId,
      storagePath,
      contentType,
      sizeBytes: file.size,
      sourceDraftId: sourceDraftId ?? null,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };

    const { error: insertError } = await supabase.from("transaction_attachments").insert(transactionAttachmentToInsertRow(created));
    if (insertError) {
      await supabase.storage.from("attachments").remove([storagePath]);
      return { ok: false, error: insertError.message };
    }

    set((s) => ({ transactionAttachments: [...s.transactionAttachments, created] }));
    return { ok: true, attachment: created };
  },

  linkTransactionAttachment: async (transactionId, input) => {
    const supabase = getSupabaseBrowserClient();
    const created: TransactionAttachment = {
      id: newId(),
      householdId: get().currentHouseholdId,
      transactionId,
      storagePath: input.storagePath,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      sourceDraftId: input.sourceDraftId,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    const { error } = await supabase.from("transaction_attachments").insert(transactionAttachmentToInsertRow(created));
    if (error) return { ok: false, error: error.message };
    set((s) => ({ transactionAttachments: [...s.transactionAttachments, created] }));
    return { ok: true, attachment: created };
  },

  deleteTransactionAttachment: (attachmentId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactionAttachments.find((a) => a.id === attachmentId);
    set((s) => ({ transactionAttachments: s.transactionAttachments.filter((a) => a.id !== attachmentId) }));
    if (!previous) return;
    supabase.storage.from("attachments").remove([previous.storagePath]).then(({ error }) => {
      if (error) console.error("Failed to remove transaction attachment from storage:", error.message);
    });
    persistOrRevert(
      supabase.from("transaction_attachments").delete().eq("id", attachmentId),
      () => set((s) => ({ transactionAttachments: [...s.transactionAttachments, previous] })),
      "Couldn't delete attachment"
    );
  },

  recordCsvImportBatch: async (input) => {
    const supabase = getSupabaseBrowserClient();
    const batch: CsvImportBatch = {
      id: newId(),
      householdId: get().currentHouseholdId,
      accountId: input.accountId,
      fileName: input.fileName,
      columnMapping: input.columnMapping,
      importedAt: nowIso(),
      rowCount: input.rowCount,
      duplicateCount: input.duplicateCount,
      status: "imported",
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    const { error } = await supabase.from("csv_import_batches").insert(csvImportBatchToInsertRow(batch));
    if (error) throw new Error(error.message);
    return batch;
  },

  linkItemPurchase: async ({ itemId, transactionId, scannedReceiptLineItemId, source }) => {
    if (!transactionId && !scannedReceiptLineItemId) {
      return { ok: false, error: "Nothing to link — pick a transaction or receipt item." };
    }
    // Real, awaited (like addAttachment/addTransactionAttachment): the
    // caller's UI treats a link as created only once the row actually
    // exists, not optimistically ahead of the write.
    const supabase = getSupabaseBrowserClient();
    const purchase: ItemPurchase = {
      id: newId(),
      householdId: get().currentHouseholdId,
      itemId,
      transactionId: transactionId ?? null,
      scannedReceiptLineItemId: scannedReceiptLineItemId ?? null,
      source,
      linkedByUserId: get().currentUserId,
      linkedAt: nowIso(),
    };
    const { error } = await supabase.from("item_purchases").insert(itemPurchaseToInsertRow(purchase));
    if (error) return { ok: false, error: error.message };
    set((s) => ({ itemPurchases: [...s.itemPurchases, purchase] }));
    return { ok: true, purchase };
  },

  unlinkItemPurchase: (purchaseId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().itemPurchases.find((p) => p.id === purchaseId);
    set((s) => ({ itemPurchases: s.itemPurchases.filter((p) => p.id !== purchaseId) }));
    if (!previous) return;
    persistOrRevert(
      supabase.from("item_purchases").delete().eq("id", purchaseId),
      () => set((s) => ({ itemPurchases: [...s.itemPurchases, previous] })),
      "Couldn't remove that link"
    );
  },

  toggleFavorite: (itemId) => {
    const supabase = getSupabaseBrowserClient();
    const userId = get().currentUserId;
    const exists = get().favorites.some((f) => f.itemId === itemId && f.userId === userId);
    set((s) => ({
      favorites: exists
        ? s.favorites.filter((f) => !(f.itemId === itemId && f.userId === userId))
        : [...s.favorites, { userId, itemId, createdAt: nowIso() }],
    }));
    persistOrRevert(
      exists
        ? supabase.from("favorites").delete().eq("user_id", userId).eq("item_id", itemId)
        : supabase.from("favorites").insert({ user_id: userId, item_id: itemId, created_at: nowIso() }),
      () =>
        set((s) => ({
          favorites: exists
            ? [...s.favorites, { userId, itemId, createdAt: nowIso() }]
            : s.favorites.filter((f) => !(f.itemId === itemId && f.userId === userId)),
        })),
      "Couldn't update favorite"
    );
  },

  isFavorite: (itemId) => {
    const userId = get().currentUserId;
    return get().favorites.some((f) => f.itemId === itemId && f.userId === userId);
  },

  inviteMember: (email, personId) => {
    const supabase = getSupabaseBrowserClient();
    const created: Invite = {
      id: newId(),
      householdId: get().currentHouseholdId,
      invitedEmail: email,
      invitedByUserId: get().currentUserId,
      status: "pending",
      createdAt: nowIso(),
      expiresAt: purgeAfter(new Date()),
      targetPersonId: personId ?? null,
    };
    set((s) => ({ invites: [...s.invites, created] }));
    persistOrRevert(
      supabase.from("invites").insert(inviteToInsertRow(created)),
      () => set((s) => ({ invites: s.invites.filter((i) => i.id !== created.id) })),
      "Couldn't send invite"
    );
    get().logActivity({ entityType: "member", entityId: created.id, entityName: email, action: "invited" });
  },

  cancelInvite: (inviteId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().invites.find((i) => i.id === inviteId);
    set((s) => ({ invites: s.invites.filter((i) => i.id !== inviteId) }));
    persistOrRevert(
      supabase.from("invites").delete().eq("id", inviteId),
      () => { if (previous) set((s) => ({ invites: [...s.invites, previous] })); },
      "Couldn't cancel invite"
    );
  },

  generateApiKey: async (label) => {
    const householdId = get().currentHouseholdId;
    const res = await fetch("/api/v1/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ householdId, label }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body.error ?? "Couldn't create the API key." };
    const apiKey = body.apiKey as ApiKey;
    set((s) => ({ apiKeys: [...s.apiKeys, apiKey] }));
    return { ok: true, apiKey, secret: body.secret as string };
  },

  revokeApiKey: (id) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().apiKeys.find((k) => k.id === id);
    if (!previous || previous.revokedAt) return;
    const revokedAt = nowIso();
    set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, revokedAt } : k)) }));
    persistOrRevert(
      supabase.from("api_keys").update({ revoked_at: revokedAt }).eq("id", id),
      () => set((s) => ({ apiKeys: s.apiKeys.map((k) => (k.id === id ? previous : k)) })),
      "Couldn't revoke key"
    );
  },

  removeMember: (userId) => {
    const supabase = getSupabaseBrowserClient();
    const m = get().members.find((m) => m.userId === userId);
    const householdId = get().currentHouseholdId;
    set((s) => ({ members: s.members.filter((m) => m.userId !== userId) }));
    persistOrRevert(
      supabase.from("members").delete().eq("household_id", householdId).eq("user_id", userId),
      () => { if (m) set((s) => ({ members: [...s.members, m] })); },
      "Couldn't remove member"
    );
    if (m) get().logActivity({ entityType: "member", entityId: userId, entityName: m.displayName, action: "removed" });

    // Converts their Person row to a managed profile rather than leaving
    // linkedUserId stale — nothing else clears it (it only nulls out via
    // an auth.users row deletion, not a household-membership removal), so
    // without this the People page's role lookup — which cross-references
    // the *current* members list, not linkedUserId's nullness — silently
    // mislabels a removed member as "Managed" while their Person row still
    // points at an account no longer in this household (Household Ledger
    // Implementation Plan §9).
    const person = get().people.find((p) => p.householdId === householdId && p.linkedUserId === userId);
    if (person) {
      const previousPerson = person;
      set((s) => ({ people: s.people.map((p) => (p.id === person.id ? { ...p, linkedUserId: null } : p)) }));
      persistOrRevert(
        supabase.from("people").update({ linked_user_id: null }).eq("id", person.id),
        () => set((s) => ({ people: s.people.map((p) => (p.id === person.id ? previousPerson : p)) })),
        "Removed the member, but couldn't update their profile"
      );
    }
  },

  transferOwnership: (toUserId) => {
    const supabase = getSupabaseBrowserClient();
    const previousMembers = get().members;
    const householdId = get().currentHouseholdId;
    const currentUserId = get().currentUserId;
    set((s) => ({
      members: s.members.map((m) => ({
        ...m,
        role: m.userId === toUserId ? "owner" : m.userId === currentUserId ? "member" : m.role,
      })),
    }));
    persistOrRevert(
      supabase.rpc("transfer_ownership", { p_household_id: householdId, p_new_owner_user_id: toUserId }),
      () => set({ members: previousMembers }),
      "Couldn't transfer ownership"
    );
    const m = get().members.find((m) => m.userId === toUserId);
    if (m)
      get().logActivity({
        entityType: "member",
        entityId: toUserId,
        entityName: m.displayName,
        action: "ownership_transferred",
      });
  },

  updateMyProfile: async (patch) => {
    const state = get();
    const me = state.members.find((m) => m.userId === state.currentUserId);
    if (!me) return { ok: false, error: "You're not a member of this household." };

    const merged: Member = { ...me, ...patch };
    set((s) => ({ members: s.members.map((m) => (m.userId === state.currentUserId ? merged : m)) }));

    const supabase = getSupabaseBrowserClient();
    const row: { display_name?: string; avatar_url?: string | null; timezone?: string | null } = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
    if (patch.timezone !== undefined) row.timezone = patch.timezone;
    const { error } = await supabase
      .from("members")
      .update(row)
      .eq("household_id", state.currentHouseholdId)
      .eq("user_id", state.currentUserId);
    if (error) {
      set((s) => ({ members: s.members.map((m) => (m.userId === state.currentUserId ? me : m)) }));
      return { ok: false, error: error.message };
    }
    return { ok: true };
  },

  addPerson: async (input) => {
    const supabase = getSupabaseBrowserClient();
    const created: Person = {
      id: newId(),
      householdId: get().currentHouseholdId,
      displayName: input.displayName,
      relationship: input.relationship,
      avatarPath: null,
      linkedUserId: input.linkedUserId ?? null,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
    };
    // Insert first, add to local state only once it's actually real — see
    // the interface comment above for why this one isn't the usual
    // optimistic-then-revert shape.
    const { error } = await supabase.from("people").insert(personToInsertRow(created));
    if (error) return { ok: false, error: error.message };
    set((s) => ({ people: [...s.people, created] }));
    get().logActivity({ entityType: "person", entityId: created.id, entityName: created.displayName, action: "created" });
    return { ok: true, person: created };
  },

  updatePerson: (personId, patch) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().people.find((p) => p.id === personId);
    if (!previous) return;
    const merged: Person = { ...previous, ...patch };
    set((s) => ({ people: s.people.map((p) => (p.id === personId ? merged : p)) }));
    persistOrRevert(
      supabase.from("people").update(personToInsertRow(merged)).eq("id", personId),
      () => set((s) => ({ people: s.people.map((p) => (p.id === personId ? previous : p)) })),
      "Couldn't update person"
    );
    get().logActivity({ entityType: "person", entityId: merged.id, entityName: merged.displayName, action: "edited" });
  },

  deletePerson: (personId) => {
    const supabase = getSupabaseBrowserClient();
    const previous = get().people.find((p) => p.id === personId);
    if (!previous) return;
    set((s) => ({ people: s.people.filter((p) => p.id !== personId) }));
    persistOrRevert(
      supabase.from("people").delete().eq("id", personId),
      () => set((s) => ({ people: [...s.people, previous] })),
      "Couldn't remove person"
    );
    get().logActivity({ entityType: "person", entityId: previous.id, entityName: previous.displayName, action: "removed" });
  },

  setPersonAvatar: async (personId, file) => {
    const person = get().people.find((p) => p.id === personId);
    if (!person) return { ok: false, error: "Person not found." };
    const previousPath = person.avatarPath;

    const uploaded = await uploadCoverPhotoFile(file, person.householdId);
    if (!uploaded.ok) return uploaded;
    const { path } = uploaded;

    const supabase = getSupabaseBrowserClient();
    set((s) => ({ people: s.people.map((p) => (p.id === personId ? { ...p, avatarPath: path } : p)) }));
    const { error: updateError } = await supabase.from("people").update({ avatar_path: path }).eq("id", personId);
    if (updateError) {
      set((s) => ({ people: s.people.map((p) => (p.id === personId ? { ...p, avatarPath: previousPath } : p)) }));
      removeCoverPhotoObject(path, "person avatar upload");
      return { ok: false, error: updateError.message };
    }
    if (previousPath) removeCoverPhotoObject(previousPath, "replaced person avatar");
    return { ok: true };
  },

  removePersonAvatar: (personId) => {
    const supabase = getSupabaseBrowserClient();
    const person = get().people.find((p) => p.id === personId);
    if (!person || !person.avatarPath) return;
    const previousPath = person.avatarPath;
    set((s) => ({ people: s.people.map((p) => (p.id === personId ? { ...p, avatarPath: null } : p)) }));
    removeCoverPhotoObject(previousPath, "person avatar");
    persistOrRevert(
      supabase.from("people").update({ avatar_path: null }).eq("id", personId),
      () => set((s) => ({ people: s.people.map((p) => (p.id === personId ? { ...p, avatarPath: previousPath } : p)) })),
      "Couldn't remove avatar"
    );
  },

  logActivity: (entry) => {
    const supabase = getSupabaseBrowserClient();
    const created: ActivityLogEntry = {
      id: newId(),
      householdId: get().currentHouseholdId,
      actorUserId: get().currentUserId,
      createdAt: nowIso(),
      ...entry,
    };
    set((s) => ({ activity: [created, ...s.activity] }));
    // Fire-and-forget, no rollback: losing a log entry to a transient
    // network error isn't worth un-showing something the user just did.
    supabase
      .from("activity_log")
      .insert(activityLogEntryToInsertRow(created))
      .then(({ error }) => {
        if (error) console.error("Failed to persist activity log entry:", error.message);
      });
  },

  markActivityViewed: () => {
    const supabase = getSupabaseBrowserClient();
    const state = get();
    const viewedAt = nowIso();
    set((s) => ({
      members: s.members.map((m) => (m.userId === state.currentUserId ? { ...m, lastActivityViewedAt: viewedAt } : m)),
    }));
    supabase
      .from("members")
      .update({ last_activity_viewed_at: viewedAt })
      .eq("household_id", state.currentHouseholdId)
      .eq("user_id", state.currentUserId)
      .then(({ error }) => {
        if (error) console.error("Failed to persist activity-viewed watermark:", error.message);
      });
  },

  purgeExpiredTrash: () => {
    const state = get();
    const now = nowIso();
    const isExpired = (status: string, after: string | null | undefined) => status === "trashed" && !!after && after <= now;

    let changed = false;

    let items = state.items;
    const survivingItems = items.filter((it) => !isExpired(it.status, it.permanentlyDeleteAfter));
    if (survivingItems.length !== items.length) {
      items = survivingItems;
      changed = true;
    }

    // Bounded loop mirrors the migration's purge_expired_trash(): a
    // container is only safe to drop once it has no remaining (surviving)
    // children, so a multi-level expired tree resolves in one call instead
    // of leaving stragglers for next time.
    let containers = state.containers;
    for (let i = 0; i < 10; i++) {
      const survivingContainers = containers.filter((c) => {
        if (!isExpired(c.status, c.permanentlyDeleteAfter)) return true;
        return containers.some((child) => child.parentContainerId === c.id);
      });
      if (survivingContainers.length === containers.length) break;
      containers = survivingContainers;
      changed = true;
    }

    let locations = state.locations;
    const survivingLocations = locations.filter((l) => {
      if (!isExpired(l.status, l.permanentlyDeleteAfter)) return true;
      return containers.some((c) => c.locationId === l.id);
    });
    if (survivingLocations.length !== locations.length) {
      locations = survivingLocations;
      changed = true;
    }

    // Finance domain — accounts/categories have a lifecycle `status` field
    // (same shape as items), so isExpired() above applies directly.
    // Transactions and recurring bills don't have one (their `status`/
    // `isActive` fields mean something else entirely — bank posting state
    // and paused/resumed) — trashed-ness there is just "trashedAt is set",
    // checked inline instead.
    const isExpiredByTrashedAt = (trashedAt: string | null, after: string | null) => !!trashedAt && !!after && after <= now;

    let accounts = state.accounts;
    const survivingAccounts = accounts.filter((a) => !isExpired(a.status, a.permanentlyDeleteAfter));
    if (survivingAccounts.length !== accounts.length) {
      accounts = survivingAccounts;
      changed = true;
    }

    let financeCategories = state.financeCategories;
    const survivingFinanceCategories = financeCategories.filter((c) => !isExpired(c.status, c.permanentlyDeleteAfter));
    if (survivingFinanceCategories.length !== financeCategories.length) {
      financeCategories = survivingFinanceCategories;
      changed = true;
    }

    let transactions = state.transactions;
    const survivingTransactions = transactions.filter((t) => !isExpiredByTrashedAt(t.trashedAt, t.permanentlyDeleteAfter));
    if (survivingTransactions.length !== transactions.length) {
      transactions = survivingTransactions;
      changed = true;
    }

    let recurringBills = state.recurringBills;
    const survivingRecurringBills = recurringBills.filter((b) => !isExpiredByTrashedAt(b.trashedAt, b.permanentlyDeleteAfter));
    if (survivingRecurringBills.length !== recurringBills.length) {
      recurringBills = survivingRecurringBills;
      changed = true;
    }

    let notes = state.notes;
    const survivingNotes = notes.filter((n) => !isExpired(n.status, n.permanentlyDeleteAfter));
    if (survivingNotes.length !== notes.length) {
      notes = survivingNotes;
      changed = true;
    }

    let tasks = state.tasks;
    const survivingTasks = tasks.filter((t) => !isExpiredByTrashedAt(t.trashedAt, t.permanentlyDeleteAfter));
    if (survivingTasks.length !== tasks.length) {
      tasks = survivingTasks;
      changed = true;
    }

    if (!changed) return;
    set({ items, containers, locations, accounts, financeCategories, transactions, recurringBills, notes, tasks });
  },
  };
});

// Sweep expired trash once at load (catches anything already past its
// purge date when the app starts) and periodically while the tab stays
// open, so an item that crosses its purge threshold mid-session
// disappears without needing a reload. This only ever hides local state —
// the real purge_expired_trash() + pg_cron job (migration 0001) does the
// actual server-side deletion on its own schedule; this sweep just keeps
// the UI from showing something the server is about to (or already did)
// remove. Guarded for SSR: this module can be evaluated on the server
// during Next.js's initial render pass, where setInterval would just leak
// a timer in a process that's about to discard it.
if (typeof window !== "undefined") {
  useInventoryStore.getState().purgeExpiredTrash();
  setInterval(() => useInventoryStore.getState().purgeExpiredTrash(), 60_000);
}

/** The household currently active in the store — components that just need name/id/createdAt shouldn't have to find() it themselves. */
export function useCurrentHousehold(): Household {
  const households = useInventoryStore((s) => s.households);
  const currentHouseholdId = useInventoryStore((s) => s.currentHouseholdId);
  const household = households.find((h) => h.id === currentHouseholdId);
  if (!household) {
    throw new Error(`currentHouseholdId ${currentHouseholdId} has no matching household — store is in an inconsistent state.`);
  }
  return household;
}

function buildItem(householdId: string, userId: string, input: NewItemInput): Item {
  const timestamp = nowIso();
  const quantity = clampQuantity(input.quantity ?? 1);
  const minQuantity = input.minQuantity ?? null;
  return {
    id: newId(),
    householdId,
    locationId: input.locationId,
    containerId: input.containerId,
    name: input.name,
    originalDetectedName: input.originalDetectedName ?? null,
    category: input.category,
    quantity,
    notes: input.notes ?? "",
    description: input.description ?? "",
    estimatedValue: input.estimatedValue ?? null,
    photoEmoji: input.photoEmoji,
    coverPhotoPath: input.coverPhotoPath ?? null,
    backgroundRemovedPhotoPath: input.backgroundRemovedPhotoPath ?? null,
    status: "active",
    needsReview: input.needsReview ?? false,
    reviewReason: input.reviewReason,
    tagIds: input.tagIds ?? [],
    extraDetails: input.extraDetails ?? {},
    ownerPersonId: input.ownerPersonId ?? null,
    isShared: input.ownerPersonId ? (input.isShared ?? false) : false,
    minQuantity,
    lowStockSince: deriveLowStockSince(false, null, quantity, minQuantity, timestamp),
    createdByUserId: userId,
    createdAt: timestamp,
    updatedAt: timestamp,
    trashedAt: null,
    permanentlyDeleteAfter: null,
  };
}

function collectDescendantContainerIds(containers: Container[], rootId: string): string[] {
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop()!;
    const children = containers.filter((c) => c.parentContainerId === current);
    for (const child of children) {
      out.push(child.id);
      stack.push(child.id);
    }
  }
  return out;
}

export { REVIEW_LOW_CONFIDENCE };
