"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "./supabase/client";
import { newId, tagToken } from "./id";
import { isDisplayCodeTaken, nextDisplayCode, normalizeDisplayCode } from "./display-code";
import { ATTACHMENT_MAX_SIZE_BYTES, ATTACHMENT_MAX_SIZE_LABEL, isAttachmentTypeAllowed } from "./attachment-limits";
import { normalizeUploadedPhoto } from "./crop-image";
import {
  rowToHousehold,
  rowToMember,
  rowToInvite,
  inviteToInsertRow,
  rowToLocation,
  locationToInsertRow,
  rowToContainer,
  containerToInsertRow,
  rowToItem,
  itemToInsertRow,
  rowToTag,
  tagToInsertRow,
  rowToFavorite,
  rowToActivityLogEntry,
  activityLogEntryToInsertRow,
  rowToAttachment,
  attachmentToInsertRow,
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
  rowToTransaction,
  transactionToInsertRow,
  rowToRecurringBill,
  recurringBillToInsertRow,
  rowToFinanceBillShare,
  financeBillShareToInsertRow,
  type HouseholdRow,
  type MemberRow,
  type InviteRow,
  type LocationRow,
  type ContainerRow,
  type ItemRow,
  type TagRow,
  type FavoriteRow,
  type ActivityLogRow,
  type AttachmentRow,
  type LabelBatchRow,
  type LabelBatchEntryRow,
  type NormalizationRuleRow,
  type AccountRow,
  type FinanceAccountShareRow,
  type FinanceCategoryRow,
  type CategoryRuleRow,
  type TransactionRow,
  type RecurringBillRow,
  type FinanceBillShareRow,
} from "./supabase/mappers";
import type {
  Account,
  AccountType,
  ActivityAction,
  ActivityEntityType,
  ActivityLogEntry,
  Attachment,
  AttachmentKind,
  CategoryRule,
  Container,
  Favorite,
  FinanceAccountShare,
  FinanceBillShare,
  FinanceCategory,
  Household,
  Invite,
  Item,
  LabelBatch,
  LabelBatchEntry,
  LabelPaperPreset,
  LabelToggle,
  Location,
  Member,
  NormalizationRule,
  RecurringBill,
  RecurringBillFrequency,
  Tag,
  Transaction,
  TransactionType,
} from "./types";
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

const TRASH_RETENTION_DAYS = 30;
const REVIEW_LOW_CONFIDENCE = 0.75;

export interface NewItemInput {
  name: string;
  originalDetectedName?: string | null;
  category: string;
  quantity?: number;
  notes?: string;
  photoEmoji: string;
  locationId: string | null;
  containerId: string | null;
  needsReview?: boolean;
  reviewReason?: string;
  tagIds?: string[];
  extraDetails?: Record<string, string>;
  /** null/omitted = shared household item, not owned by one person. */
  ownerUserId?: string | null;
}

const QUANTITY_MIN = 0;
const QUANTITY_MAX = 9999;

function clampQuantity(value: number): number {
  return Math.min(QUANTITY_MAX, Math.max(QUANTITY_MIN, Math.round(value)));
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
}

interface InventoryState {
  /** Every household the current user belongs to. */
  households: Household[];
  /** Which household's data currently occupies the fields below. Empty string before hydration or if the user has none yet. */
  currentHouseholdId: string;
  members: Member[];
  invites: Invite[];
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  normalizationRules: NormalizationRule[];
  activity: ActivityLogEntry[];
  favorites: Favorite[];
  attachments: Attachment[];
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
  recurringBills: RecurringBill[];
  financeBillShares: FinanceBillShare[];
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
  updateTransaction: (transactionId: string, patch: Partial<Transaction>) => void;
  trashTransaction: (transactionId: string) => void;
  restoreTransaction: (transactionId: string) => void;
  permanentlyDeleteTransaction: (transactionId: string) => void;

  // Finance — Categories & rules (household-wide, no privacy layer)
  createFinanceCategory: (input: { name: string; parentCategoryId?: string | null }) => FinanceCategory;
  updateFinanceCategory: (categoryId: string, patch: Partial<FinanceCategory>) => void;
  /** Fails server-side (blocked by prevent_trash_referenced_category() trigger, PRD §32.6) if any non-trashed transaction still references this category — caller should reassign or archive first, not just retry. */
  trashFinanceCategory: (categoryId: string) => void;
  restoreFinanceCategory: (categoryId: string) => void;
  createCategoryRule: (input: { matchField: "merchant" | "description"; matchType?: "contains" | "exact"; matchValue: string; categoryId: string }) => CategoryRule;
  deleteCategoryRule: (ruleId: string) => void;

  // Finance — Recurring bills
  createRecurringBill: (input: NewRecurringBillInput) => RecurringBill;
  updateRecurringBill: (billId: string, patch: Partial<RecurringBill>) => void;
  trashRecurringBill: (billId: string) => void;
  restoreRecurringBill: (billId: string) => void;
  permanentlyDeleteRecurringBill: (billId: string) => void;
  shareRecurringBill: (billId: string, withUserId: string) => void;
  unshareRecurringBill: (billId: string, withUserId: string) => void;

  // Favorites
  toggleFavorite: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;

  // Household / members
  /** Creates a brand-new household via create_household(), adds the current user as its Owner, switches to it, and starts it with empty inventory. Real, awaited: the household id is server-generated. */
  createHousehold: (input: { name: string; displayName: string; email: string; avatarUrl?: string }) => Promise<Household>;
  /** Swaps the active household's data for another one the current user belongs to (fetched fresh, or from this session's cache). No-op if already current. */
  switchHousehold: (householdId: string) => Promise<void>;
  /** Redeems the caller's own pending invite (matched server-side by their authenticated email, via accept_invite_by_email()) and switches to the joined household. `email` is a client-side confirmation check, not what's sent to the server. */
  acceptInvite: (email: string, displayName: string) => Promise<{ ok: boolean; error?: string; household?: Household }>;
  /** Leaves the current household. Blocked if the caller is its Owner (transfer ownership first) or if it's their only household. Real, awaited. */
  leaveHousehold: () => Promise<{ ok: boolean; error?: string }>;
  inviteMember: (email: string) => void;
  cancelInvite: (inviteId: string) => void;
  removeMember: (userId: string) => void;
  transferOwnership: (toUserId: string) => void;
  /** Updates the caller's own membership row in the current household (display name, avatar). Real, awaited. */
  updateMyProfile: (patch: { displayName?: string; avatarUrl?: string }) => Promise<{ ok: boolean; error?: string }>;

  // Activity
  logActivity: (entry: {
    entityType: ActivityEntityType;
    entityId: string;
    entityName: string;
    action: ActivityAction;
    detail?: string;
  }) => void;

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
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  favorites: Favorite[];
  activity: ActivityLogEntry[];
  attachments: Attachment[];
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
  lastUsedDestination: { locationId: string | null; containerId: string | null } | null;
}

function snapshotBundle(state: InventoryState): HouseholdBundle {
  return {
    members: state.members,
    invites: state.invites,
    locations: state.locations,
    containers: state.containers,
    items: state.items,
    tags: state.tags,
    favorites: state.favorites,
    activity: state.activity,
    attachments: state.attachments,
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
    locationsRes,
    containersRes,
    itemsRes,
    tagsRes,
    favoritesRes,
    activityRes,
    attachmentsRes,
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
  ] = await Promise.all([
    supabase.from("members").select("*").eq("household_id", householdId),
    supabase.from("invites").select("*").eq("household_id", householdId),
    supabase.from("locations").select("*").eq("household_id", householdId),
    supabase.from("containers").select("*").eq("household_id", householdId),
    supabase.from("items").select("*, item_tags(tag_id)").eq("household_id", householdId),
    supabase.from("tags").select("*").eq("household_id", householdId),
    supabase.from("favorites").select("*, items!inner(household_id)").eq("user_id", userId).eq("items.household_id", householdId),
    supabase.from("activity_log").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(500),
    supabase.from("attachments").select("*").eq("household_id", householdId),
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
  ]);

  const firstError =
    membersRes.error ?? invitesRes.error ?? locationsRes.error ?? containersRes.error ?? itemsRes.error ?? tagsRes.error ?? favoritesRes.error ?? activityRes.error ??
    attachmentsRes.error ?? labelBatchesRes.error ?? labelBatchEntriesRes.error ?? normalizationRulesRes.error ??
    accountsRes.error ?? financeAccountSharesRes.error ?? transactionsRes.error ?? financeCategoriesRes.error ?? categoryRulesRes.error ?? recurringBillsRes.error ?? financeBillSharesRes.error;
  if (firstError) throw new Error(firstError.message);

  type ItemRowWithTags = ItemRow & { item_tags: { tag_id: string }[] | null };

  return {
    members: ((membersRes.data ?? []) as MemberRow[]).map(rowToMember),
    invites: ((invitesRes.data ?? []) as InviteRow[]).map(rowToInvite),
    locations: ((locationsRes.data ?? []) as LocationRow[]).map(rowToLocation),
    containers: ((containersRes.data ?? []) as ContainerRow[]).map(rowToContainer),
    items: ((itemsRes.data ?? []) as ItemRowWithTags[]).map((row) => rowToItem(row, (row.item_tags ?? []).map((jt) => jt.tag_id))),
    tags: ((tagsRes.data ?? []) as TagRow[]).map(rowToTag),
    favorites: ((favoritesRes.data ?? []) as FavoriteRow[]).map(rowToFavorite),
    activity: ((activityRes.data ?? []) as ActivityLogRow[]).map(rowToActivityLogEntry),
    attachments: ((attachmentsRes.data ?? []) as AttachmentRow[]).map(rowToAttachment),
    labelBatches: ((labelBatchesRes.data ?? []) as LabelBatchRow[]).map(rowToLabelBatch),
    labelBatchEntries: ((labelBatchEntriesRes.data ?? []) as LabelBatchEntryRow[]).map(rowToLabelBatchEntry),
    normalizationRules: ((normalizationRulesRes.data ?? []) as NormalizationRuleRow[]).map(rowToNormalizationRule),
    accounts: ((accountsRes.data ?? []) as AccountRow[]).map(rowToAccount),
    financeAccountShares: ((financeAccountSharesRes.data ?? []) as FinanceAccountShareRow[]).map(rowToFinanceAccountShare),
    transactions: ((transactionsRes.data ?? []) as TransactionRow[]).map(rowToTransaction),
    financeCategories: ((financeCategoriesRes.data ?? []) as FinanceCategoryRow[]).map(rowToFinanceCategory),
    categoryRules: ((categoryRulesRes.data ?? []) as CategoryRuleRow[]).map(rowToCategoryRule),
    recurringBills: ((recurringBillsRes.data ?? []) as RecurringBillRow[]).map(rowToRecurringBill),
    financeBillShares: ((financeBillSharesRes.data ?? []) as FinanceBillShareRow[]).map(rowToFinanceBillShare),
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
 * confirmed live — this only handles validation + the upload itself. */
async function uploadCoverPhotoFile(file: File, householdId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
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

function removeCoverPhotoObject(path: string, context: string) {
  getSupabaseBrowserClient()
    .storage.from("item-photos")
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
  locations: [],
  containers: [],
  items: [],
  tags: [],
  normalizationRules: [],
  activity: [],
  favorites: [],
  attachments: [],
  labelBatches: [],
  labelBatchEntries: [],
  accounts: [],
  financeAccountShares: [],
  transactions: [],
  financeCategories: [],
  categoryRules: [],
  recurringBills: [],
  financeBillShares: [],
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
        | "members" | "invites" | "locations" | "containers" | "tags" | "activity" | "attachments"
        | "labelBatches" | "labelBatchEntries" | "normalizationRules"
        | "accounts" | "financeAccountShares" | "transactions" | "financeCategories" | "categoryRules"
        | "recurringBills" | "financeBillShares"
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
    bind<LocationRow, Location>("locations", householdFilter, rowToLocation, (l) => l.id, (r) => r.id as string, "locations");
    bind<ContainerRow, Container>("containers", householdFilter, rowToContainer, (c) => c.id, (r) => r.id as string, "containers");
    bind<TagRow, Tag>("tags", householdFilter, rowToTag, (t) => t.id, (r) => r.id as string, "tags");
    bind<ActivityLogRow, ActivityLogEntry>("activity_log", householdFilter, rowToActivityLogEntry, (a) => a.id, (r) => r.id as string, "activity");
    bind<AttachmentRow, Attachment>("attachments", householdFilter, rowToAttachment, (a) => a.id, (r) => r.id as string, "attachments");
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
    bind<TransactionRow, Transaction>("transactions", householdFilter, rowToTransaction, (t) => t.id, (r) => r.id as string, "transactions");
    bind<CategoryRuleRow, CategoryRule>("category_rules", householdFilter, rowToCategoryRule, (r) => r.id, (r) => r.id as string, "categoryRules");
    bind<RecurringBillRow, RecurringBill>("recurring_bills", householdFilter, rowToRecurringBill, (b) => b.id, (r) => r.id as string, "recurringBills");
    bind<FinanceBillShareRow, FinanceBillShare>("finance_bill_shares", householdFilter, rowToFinanceBillShare, (s) => s.id, (r) => r.id as string, "financeBillShares");
    // categories: filtered by household_id like everything else above,
    // which means it only catches this household's own custom categories
    // — a system default (household_id null) changing live wouldn't reach
    // here, since Realtime's filter syntax can't express "column IS NULL
    // OR column = X" in one subscription. Acceptable, documented gap:
    // system defaults are effectively static after seeding, unlike every
    // other table this store subscribes to.
    bind<FinanceCategoryRow, FinanceCategory>("categories", householdFilter, rowToFinanceCategory, (c) => c.id, (r) => r.id as string, "financeCategories");

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

  switchHousehold: async (householdId) => {
    const state = get();
    if (householdId === state.currentHouseholdId) return;
    if (!state.households.some((h) => h.id === householdId)) return;

    const supabase = getSupabaseBrowserClient();
    const bundle = otherHouseholdCache[householdId] ?? (await fetchHouseholdBundle(supabase, householdId, state.currentUserId));

    otherHouseholdCache[state.currentHouseholdId] = snapshotBundle(get());
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
    const merged: Item = { ...previous, ...normalizedPatch, updatedAt: nowIso() };
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
    const previous = get().items.find((it) => it.id === itemId);
    if (!previous) return;
    const merged: Item = { ...previous, locationId: dest.locationId, containerId: dest.containerId, updatedAt: nowIso() };
    set((s) => ({ items: s.items.map((it) => (it.id === itemId ? merged : it)), lastUsedDestination: dest }));
    persistOrRevert(
      supabase.from("items").update(itemToInsertRow(merged)).eq("id", itemId),
      () => set((s) => ({ items: s.items.map((it) => (it.id === itemId ? previous : it)) })),
      "Couldn't move item"
    );
    get().logActivity({ entityType: "item", entityId: merged.id, entityName: merged.name, action: "moved" });
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
    const created: Container = {
      id: newId(),
      householdId: get().currentHouseholdId,
      locationId: input.locationId,
      parentContainerId: input.parentContainerId ?? null,
      name: input.name,
      description: input.description,
      tagToken: tagToken(),
      displayCode: null,
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
    const created: Account = {
      id: newId(),
      householdId: get().currentHouseholdId,
      name: input.name,
      type: input.type,
      institutionName: input.institutionName ?? null,
      currentBalance: input.startingBalance ?? 0,
      availableBalance: input.availableBalance ?? null,
      startingBalance: input.startingBalance ?? 0,
      cardLastFour: input.cardLastFour ?? null,
      ownerUserId: input.ownerUserId ?? null,
      status: "active",
      openedAt: input.openedAt ?? null,
      trashedAt: null,
      permanentlyDeleteAfter: null,
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
    persistOrRevert(
      supabase.from("accounts").update(accountToInsertRow(merged)).eq("id", accountId),
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
    };
    set((s) => ({ transactions: [created, ...s.transactions] }));
    persistOrRevert(
      supabase.from("transactions").insert(transactionToInsertRow(created)),
      () => set((s) => ({ transactions: s.transactions.filter((t) => t.id !== created.id) })),
      "Couldn't save transaction"
    );
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
    const supabase = getSupabaseBrowserClient();
    const previous = get().transactions.find((t) => t.id === transactionId);
    if (!previous) return;
    const merged: Transaction = { ...previous, ...patch, updatedAt: nowIso() };
    set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? merged : t)) }));
    persistOrRevert(
      supabase.from("transactions").update(transactionToInsertRow(merged)).eq("id", transactionId),
      () => set((s) => ({ transactions: s.transactions.map((t) => (t.id === transactionId ? previous : t)) })),
      "Couldn't update transaction"
    );
    get().logActivity({ entityType: "transaction", entityId: merged.id, entityName: merged.merchant ?? merged.description ?? "Transaction", action: "edited" });
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
    set((s) => ({ transactions: s.transactions.filter((x) => x.id !== transactionId) }));
    persistOrRevert(
      supabase.from("transactions").delete().eq("id", transactionId),
      () => { if (t) set((s) => ({ transactions: [...s.transactions, t] })); },
      "Couldn't permanently delete transaction"
    );
    if (t) get().logActivity({ entityType: "transaction", entityId: t.id, entityName: t.merchant ?? t.description ?? "Transaction", action: "deleted_forever" });
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

  inviteMember: (email) => {
    const supabase = getSupabaseBrowserClient();
    const created: Invite = {
      id: newId(),
      householdId: get().currentHouseholdId,
      invitedEmail: email,
      invitedByUserId: get().currentUserId,
      status: "pending",
      createdAt: nowIso(),
      expiresAt: purgeAfter(new Date()),
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
    const row: { display_name?: string; avatar_url?: string | null } = {};
    if (patch.displayName !== undefined) row.display_name = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
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

    if (!changed) return;
    set({ items, containers, locations, accounts, financeCategories, transactions, recurringBills });
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
  return {
    id: newId(),
    householdId,
    locationId: input.locationId,
    containerId: input.containerId,
    name: input.name,
    originalDetectedName: input.originalDetectedName ?? null,
    category: input.category,
    quantity: clampQuantity(input.quantity ?? 1),
    notes: input.notes ?? "",
    photoEmoji: input.photoEmoji,
    coverPhotoPath: null,
    status: "active",
    needsReview: input.needsReview ?? false,
    reviewReason: input.reviewReason,
    tagIds: input.tagIds ?? [],
    extraDetails: input.extraDetails ?? {},
    ownerUserId: input.ownerUserId ?? null,
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
