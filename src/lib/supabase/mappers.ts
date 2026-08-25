// Explicit row (snake_case, as Postgres/PostgREST returns it) <-> domain
// (camelCase, src/lib/types.ts) mapping for the tables store.ts now reads
// and writes for real. One pair of functions per entity rather than a
// generic camelCase/snake_case converter, so a column rename or type
// mismatch shows up as a type error at a single obvious call site instead
// of silently flowing through a generic reshaper.

import type {
  Household,
  Member,
  Invite,
  Person,
  PersonRelationship,
  Location,
  Container,
  Item,
  Tag,
  Favorite,
  ActivityLogEntry,
  Attachment,
  ItemDocumentLink,
  ItemDocumentLinkKind,
  AttachmentKind,
  PinnedLocation,
  PinnedLocationCategory,
  LabelBatch,
  LabelBatchEntry,
  LabelPaperPreset,
  LabelToggle,
  LabelBatchStatus,
  LabelBatchEntryStatus,
  NormalizationRule,
  NormalizationSource,
  Account,
  AccountType,
  FinanceLifecycleStatus,
  FinanceAccountShare,
  AccountBalanceSnapshot,
  Transaction,
  TransactionType,
  TransactionStatus,
  TransactionSource,
  FinanceCategory,
  FinanceCategoryStatus,
  CategoryRule,
  CategoryBudget,
  FinanceSettings,
  RecurringBill,
  RecurringBillFrequency,
  FinanceBillShare,
  RecurringCandidateDismissal,
  ReceiptScanBatch,
  ReceiptScanBatchStatus,
  ScannedTransactionDraft,
  CategorySource,
  ScannedTransactionDraftStatus,
  BoundingBoxLike,
  ScannedReceiptLineItem,
  TransactionAttachment,
  TransactionCategory,
  ItemPurchase,
  ItemPurchaseSource,
  CsvImportBatch,
  CsvImportBatchStatus,
  PlaidItem,
  PlaidItemStatus,
  PushDeviceSubscription,
  NotificationPreference,
  ApiKey,
} from "../types";

export interface HouseholdRow {
  id: string;
  name: string;
  created_at: string;
  receipts_token: string;
  finance_enabled: boolean;
  inventory_enabled: boolean;
}

export function rowToHousehold(row: HouseholdRow): Household {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    receiptsToken: row.receipts_token,
    financeEnabled: row.finance_enabled,
    inventoryEnabled: row.inventory_enabled,
  };
}

export interface MemberRow {
  household_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  last_activity_viewed_at: string | null;
  timezone: string | null;
}

export function rowToMember(row: MemberRow): Member {
  return {
    householdId: row.household_id,
    userId: row.user_id,
    role: row.role as Member["role"],
    joinedAt: row.joined_at,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    lastActivityViewedAt: row.last_activity_viewed_at,
    timezone: row.timezone,
  };
}

export interface InviteRow {
  id: string;
  household_id: string;
  invited_email: string;
  invited_by_user_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  target_person_id: string | null;
}

export function rowToInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    householdId: row.household_id,
    invitedEmail: row.invited_email,
    invitedByUserId: row.invited_by_user_id,
    status: row.status as Invite["status"],
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    targetPersonId: row.target_person_id,
  };
}

export function inviteToInsertRow(invite: Invite): InviteRow {
  return {
    id: invite.id,
    household_id: invite.householdId,
    invited_email: invite.invitedEmail,
    invited_by_user_id: invite.invitedByUserId,
    status: invite.status,
    created_at: invite.createdAt,
    expires_at: invite.expiresAt,
    target_person_id: invite.targetPersonId,
  };
}

// Deliberately no `key_hash` field here, unlike every other *Row type in
// this file — the client-side household bundle fetch (store.ts) never
// selects that column in the first place (see the api_keys query there),
// so there's nothing for this shape to carry. The one place that does
// touch key_hash — generating a key — is a one-off server-side insert in
// src/app/api/v1/api-keys/route.ts, written inline rather than through an
// apiKeyToInsertRow() here, so a hash never has a typed path into
// anything client bundles could import.
export interface ApiKeyRow {
  id: string;
  household_id: string;
  created_by_user_id: string;
  label: string;
  key_prefix: string;
  last_four: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function rowToApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    householdId: row.household_id,
    createdByUserId: row.created_by_user_id,
    label: row.label,
    keyPrefix: row.key_prefix,
    lastFour: row.last_four,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export interface PersonRow {
  id: string;
  household_id: string;
  display_name: string;
  relationship: string;
  avatar_path: string | null;
  linked_user_id: string | null;
  created_by_user_id: string;
  created_at: string;
}

export function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    householdId: row.household_id,
    displayName: row.display_name,
    relationship: row.relationship as PersonRelationship,
    avatarPath: row.avatar_path,
    linkedUserId: row.linked_user_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export function personToInsertRow(p: Person): PersonRow {
  return {
    id: p.id,
    household_id: p.householdId,
    display_name: p.displayName,
    relationship: p.relationship,
    avatar_path: p.avatarPath,
    linked_user_id: p.linkedUserId,
    created_by_user_id: p.createdByUserId,
    created_at: p.createdAt,
  };
}

export interface LocationRow {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  cover_photo_emoji: string | null;
  cover_photo_path: string | null;
  created_by_user_id: string;
  created_at: string;
  status: string;
  trashed_at: string | null;
  permanently_delete_after: string | null;
}

export function rowToLocation(row: LocationRow): Location {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    description: row.description ?? undefined,
    coverPhotoEmoji: row.cover_photo_emoji ?? undefined,
    coverPhotoPath: row.cover_photo_path,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    status: row.status as Location["status"],
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
  };
}

export function locationToInsertRow(loc: Location): LocationRow {
  return {
    id: loc.id,
    household_id: loc.householdId,
    name: loc.name,
    description: loc.description ?? null,
    cover_photo_emoji: loc.coverPhotoEmoji ?? null,
    cover_photo_path: loc.coverPhotoPath,
    created_by_user_id: loc.createdByUserId,
    created_at: loc.createdAt,
    status: loc.status,
    trashed_at: loc.trashedAt ?? null,
    permanently_delete_after: loc.permanentlyDeleteAfter ?? null,
  };
}

export interface PinnedLocationRow {
  id: string;
  household_id: string;
  name: string;
  category: string;
  photo_path: string | null;
  location_note: string | null;
  created_by_user_id: string;
  created_at: string;
}

export function rowToPinnedLocation(row: PinnedLocationRow): PinnedLocation {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    category: row.category as PinnedLocationCategory,
    photoPath: row.photo_path,
    locationNote: row.location_note,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export function pinnedLocationToInsertRow(pin: PinnedLocation): PinnedLocationRow {
  return {
    id: pin.id,
    household_id: pin.householdId,
    name: pin.name,
    category: pin.category,
    photo_path: pin.photoPath,
    location_note: pin.locationNote,
    created_by_user_id: pin.createdByUserId,
    created_at: pin.createdAt,
  };
}

export interface ContainerRow {
  id: string;
  household_id: string;
  location_id: string;
  parent_container_id: string | null;
  name: string;
  description: string | null;
  tag_token: string;
  display_code: string | null;
  cover_photo_emoji: string | null;
  cover_photo_path: string | null;
  created_by_user_id: string;
  created_at: string;
  status: string;
  trashed_at: string | null;
  permanently_delete_after: string | null;
  nfc_linked_at: string | null;
}

export function rowToContainer(row: ContainerRow): Container {
  return {
    id: row.id,
    householdId: row.household_id,
    locationId: row.location_id,
    parentContainerId: row.parent_container_id,
    name: row.name,
    description: row.description ?? undefined,
    tagToken: row.tag_token,
    displayCode: row.display_code,
    coverPhotoEmoji: row.cover_photo_emoji ?? undefined,
    coverPhotoPath: row.cover_photo_path,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    status: row.status as Container["status"],
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
    nfcLinkedAt: row.nfc_linked_at,
  };
}

export function containerToInsertRow(c: Container): ContainerRow {
  return {
    id: c.id,
    household_id: c.householdId,
    location_id: c.locationId,
    parent_container_id: c.parentContainerId ?? null,
    name: c.name,
    description: c.description ?? null,
    tag_token: c.tagToken,
    display_code: c.displayCode,
    cover_photo_emoji: c.coverPhotoEmoji ?? null,
    cover_photo_path: c.coverPhotoPath,
    created_by_user_id: c.createdByUserId,
    created_at: c.createdAt,
    status: c.status,
    trashed_at: c.trashedAt ?? null,
    permanently_delete_after: c.permanentlyDeleteAfter ?? null,
    nfc_linked_at: c.nfcLinkedAt,
  };
}

export interface ItemRow {
  id: string;
  household_id: string;
  location_id: string | null;
  container_id: string | null;
  name: string;
  original_detected_name: string | null;
  category: string;
  quantity: number;
  notes: string;
  description: string;
  estimated_value: number | null;
  photo_emoji: string;
  cover_photo_path: string | null;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
  extra_details: Record<string, string>;
  owner_person_id: string | null;
  is_shared: boolean;
  min_quantity: number | null;
  low_stock_since: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  permanently_delete_after: string | null;
}

/** tagIds comes from a separate item_tags join/aggregation, not a column on this row. */
export function rowToItem(row: ItemRow, tagIds: string[]): Item {
  return {
    id: row.id,
    householdId: row.household_id,
    locationId: row.location_id,
    containerId: row.container_id,
    name: row.name,
    originalDetectedName: row.original_detected_name,
    category: row.category,
    quantity: row.quantity,
    notes: row.notes,
    description: row.description,
    estimatedValue: row.estimated_value,
    photoEmoji: row.photo_emoji,
    coverPhotoPath: row.cover_photo_path,
    status: row.status as Item["status"],
    needsReview: row.needs_review,
    reviewReason: row.review_reason ?? undefined,
    tagIds,
    extraDetails: row.extra_details,
    ownerPersonId: row.owner_person_id,
    isShared: row.is_shared,
    minQuantity: row.min_quantity,
    lowStockSince: row.low_stock_since,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
  };
}

export function itemToInsertRow(it: Item): ItemRow {
  return {
    id: it.id,
    household_id: it.householdId,
    location_id: it.locationId,
    container_id: it.containerId,
    name: it.name,
    original_detected_name: it.originalDetectedName,
    category: it.category,
    quantity: it.quantity,
    notes: it.notes,
    description: it.description,
    estimated_value: it.estimatedValue,
    photo_emoji: it.photoEmoji,
    cover_photo_path: it.coverPhotoPath,
    status: it.status,
    needs_review: it.needsReview,
    review_reason: it.reviewReason ?? null,
    extra_details: it.extraDetails,
    owner_person_id: it.ownerPersonId,
    is_shared: it.isShared,
    min_quantity: it.minQuantity,
    low_stock_since: it.lowStockSince,
    created_by_user_id: it.createdByUserId,
    created_at: it.createdAt,
    updated_at: it.updatedAt,
    trashed_at: it.trashedAt ?? null,
    permanently_delete_after: it.permanentlyDeleteAfter ?? null,
  };
}

export interface TagRow {
  id: string;
  household_id: string;
  name: string;
}

export function rowToTag(row: TagRow): Tag {
  return { id: row.id, householdId: row.household_id, name: row.name };
}

export function tagToInsertRow(tag: Tag): TagRow {
  return { id: tag.id, household_id: tag.householdId, name: tag.name };
}

export interface FavoriteRow {
  user_id: string;
  item_id: string;
  created_at: string;
}

export function rowToFavorite(row: FavoriteRow): Favorite {
  return { userId: row.user_id, itemId: row.item_id, createdAt: row.created_at };
}

export function favoriteToInsertRow(fav: Favorite): FavoriteRow {
  return { user_id: fav.userId, item_id: fav.itemId, created_at: fav.createdAt };
}

export interface ActivityLogRow {
  id: string;
  household_id: string;
  actor_user_id: string;
  entity_type: string;
  entity_id: string;
  entity_name: string;
  action: string;
  detail: string | null;
  created_at: string;
}

export function rowToActivityLogEntry(row: ActivityLogRow): ActivityLogEntry {
  return {
    id: row.id,
    householdId: row.household_id,
    actorUserId: row.actor_user_id,
    entityType: row.entity_type as ActivityLogEntry["entityType"],
    entityId: row.entity_id,
    entityName: row.entity_name,
    action: row.action as ActivityLogEntry["action"],
    detail: row.detail ?? undefined,
    createdAt: row.created_at,
  };
}

export function activityLogEntryToInsertRow(entry: ActivityLogEntry): ActivityLogRow {
  return {
    id: entry.id,
    household_id: entry.householdId,
    actor_user_id: entry.actorUserId,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_name: entry.entityName,
    action: entry.action,
    detail: entry.detail ?? null,
    created_at: entry.createdAt,
  };
}

export interface AttachmentRow {
  id: string;
  household_id: string;
  item_id: string;
  kind: string;
  file_name: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  created_by_user_id: string;
  created_at: string;
}

export function rowToAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    householdId: row.household_id,
    itemId: row.item_id,
    kind: row.kind as AttachmentKind,
    fileName: row.file_name,
    storagePath: row.storage_path,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export function attachmentToInsertRow(att: Attachment): AttachmentRow {
  return {
    id: att.id,
    household_id: att.householdId,
    item_id: att.itemId,
    kind: att.kind,
    file_name: att.fileName,
    storage_path: att.storagePath,
    content_type: att.contentType,
    size_bytes: att.sizeBytes,
    created_by_user_id: att.createdByUserId,
    created_at: att.createdAt,
  };
}

export interface ItemDocumentLinkRow {
  id: string;
  household_id: string;
  item_id: string;
  kind: string;
  url: string;
  label: string;
  created_at: string;
}

export function rowToItemDocumentLink(row: ItemDocumentLinkRow): ItemDocumentLink {
  return {
    id: row.id,
    householdId: row.household_id,
    itemId: row.item_id,
    kind: row.kind as ItemDocumentLinkKind,
    url: row.url,
    label: row.label,
    createdAt: row.created_at,
  };
}

export function itemDocumentLinkToInsertRow(link: ItemDocumentLink): ItemDocumentLinkRow {
  return {
    id: link.id,
    household_id: link.householdId,
    item_id: link.itemId,
    kind: link.kind,
    url: link.url,
    label: link.label,
    created_at: link.createdAt,
  };
}

export interface LabelBatchRow {
  id: string;
  household_id: string;
  created_by_user_id: string;
  created_at: string;
  paper_preset: string;
  toggle: string;
  include_location: boolean;
  offset_x: number;
  offset_y: number;
  status: string;
}

export function rowToLabelBatch(row: LabelBatchRow): LabelBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    paperPreset: row.paper_preset as LabelPaperPreset,
    toggle: row.toggle as LabelToggle,
    includeLocation: row.include_location,
    offsetX: row.offset_x,
    offsetY: row.offset_y,
    status: row.status as LabelBatchStatus,
  };
}

export function labelBatchToInsertRow(batch: LabelBatch): LabelBatchRow {
  return {
    id: batch.id,
    household_id: batch.householdId,
    created_by_user_id: batch.createdByUserId,
    created_at: batch.createdAt,
    paper_preset: batch.paperPreset,
    toggle: batch.toggle,
    include_location: batch.includeLocation,
    offset_x: batch.offsetX,
    offset_y: batch.offsetY,
    status: batch.status,
  };
}

export interface LabelBatchEntryRow {
  id: string;
  batch_id: string;
  household_id: string;
  container_id: string | null;
  tag_token: string;
  display_code: string | null;
  status: string;
}

export function rowToLabelBatchEntry(row: LabelBatchEntryRow): LabelBatchEntry {
  return {
    id: row.id,
    batchId: row.batch_id,
    householdId: row.household_id,
    containerId: row.container_id,
    tagToken: row.tag_token,
    displayCode: row.display_code,
    status: row.status as LabelBatchEntryStatus,
  };
}

export function labelBatchEntryToInsertRow(entry: LabelBatchEntry): LabelBatchEntryRow {
  return {
    id: entry.id,
    batch_id: entry.batchId,
    household_id: entry.householdId,
    container_id: entry.containerId,
    tag_token: entry.tagToken,
    display_code: entry.displayCode,
    status: entry.status,
  };
}

export interface NormalizationRuleRow {
  id: string;
  household_id: string;
  raw_pattern: string;
  canonical_name: string;
  category: string;
  source: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export function rowToNormalizationRule(row: NormalizationRuleRow): NormalizationRule {
  return {
    id: row.id,
    householdId: row.household_id,
    rawPattern: row.raw_pattern,
    canonicalName: row.canonical_name,
    category: row.category,
    source: row.source as NormalizationSource,
    usageCount: row.usage_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizationRuleToInsertRow(rule: NormalizationRule): NormalizationRuleRow {
  return {
    id: rule.id,
    household_id: rule.householdId,
    raw_pattern: rule.rawPattern,
    canonical_name: rule.canonicalName,
    category: rule.category,
    source: rule.source,
    usage_count: rule.usageCount,
    created_at: rule.createdAt,
    updated_at: rule.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Finance domain (supabase/migrations/0010_finance_schema.sql). Money
// columns are Postgres `numeric` — PostgREST serializes those as plain JSON
// numbers (unlike `bigint`, which comes back as a string), so `number` here
// is a direct, no-parsing mapping, not an assumption layered on top.
// ---------------------------------------------------------------------------

export interface AccountRow {
  id: string;
  household_id: string;
  name: string;
  type: string;
  institution_name: string | null;
  current_balance: number;
  available_balance: number | null;
  starting_balance: number;
  card_last_four: string | null;
  owner_user_id: string | null;
  status: string;
  opened_at: string | null;
  trashed_at: string | null;
  permanently_delete_after: string | null;
  plaid_item_id: string | null;
  plaid_account_id: string | null;
  created_by_user_id: string | null;
}

export function rowToAccount(row: AccountRow): Account {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    type: row.type as AccountType,
    institutionName: row.institution_name,
    currentBalance: row.current_balance,
    availableBalance: row.available_balance,
    startingBalance: row.starting_balance,
    cardLastFour: row.card_last_four,
    ownerUserId: row.owner_user_id,
    status: row.status as FinanceLifecycleStatus,
    openedAt: row.opened_at,
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
    plaidItemId: row.plaid_item_id,
    plaidAccountId: row.plaid_account_id,
    createdByUserId: row.created_by_user_id,
  };
}

/** Omits current_balance — that column is trigger-owned (recompute_account_balance() in 0010_finance_schema.sql); a client write to it would just be overwritten server-side on the next transaction change, so insert/update rows never include it. */
export function accountToInsertRow(a: Account): Omit<AccountRow, "current_balance"> {
  return {
    id: a.id,
    household_id: a.householdId,
    name: a.name,
    type: a.type,
    institution_name: a.institutionName,
    available_balance: a.availableBalance,
    starting_balance: a.startingBalance,
    card_last_four: a.cardLastFour,
    owner_user_id: a.ownerUserId,
    status: a.status,
    opened_at: a.openedAt,
    trashed_at: a.trashedAt,
    permanently_delete_after: a.permanentlyDeleteAfter,
    plaid_item_id: a.plaidItemId,
    plaid_account_id: a.plaidAccountId,
    created_by_user_id: a.createdByUserId,
  };
}

export interface FinanceAccountShareRow {
  id: string;
  household_id: string;
  account_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  created_at: string;
}

export function rowToFinanceAccountShare(row: FinanceAccountShareRow): FinanceAccountShare {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    sharedWithUserId: row.shared_with_user_id,
    sharedByUserId: row.shared_by_user_id,
    createdAt: row.created_at,
  };
}

export function financeAccountShareToInsertRow(s: FinanceAccountShare): FinanceAccountShareRow {
  return {
    id: s.id,
    household_id: s.householdId,
    account_id: s.accountId,
    shared_with_user_id: s.sharedWithUserId,
    shared_by_user_id: s.sharedByUserId,
    created_at: s.createdAt,
  };
}

export interface FinanceCategoryRow {
  id: string;
  household_id: string | null;
  name: string;
  parent_category_id: string | null;
  is_default: boolean;
  status: string;
  trashed_at: string | null;
  permanently_delete_after: string | null;
}

export function rowToFinanceCategory(row: FinanceCategoryRow): FinanceCategory {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    parentCategoryId: row.parent_category_id,
    isDefault: row.is_default,
    status: row.status as FinanceCategoryStatus,
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
  };
}

export function financeCategoryToInsertRow(c: FinanceCategory): FinanceCategoryRow {
  return {
    id: c.id,
    household_id: c.householdId,
    name: c.name,
    parent_category_id: c.parentCategoryId,
    is_default: c.isDefault,
    status: c.status,
    trashed_at: c.trashedAt,
    permanently_delete_after: c.permanentlyDeleteAfter,
  };
}

export interface CategoryRuleRow {
  id: string;
  household_id: string;
  match_field: string;
  match_type: string;
  match_value: string;
  category_id: string;
  applies_from: string;
  created_at: string;
}

export function rowToCategoryRule(row: CategoryRuleRow): CategoryRule {
  return {
    id: row.id,
    householdId: row.household_id,
    matchField: row.match_field as CategoryRule["matchField"],
    matchType: row.match_type as CategoryRule["matchType"],
    matchValue: row.match_value,
    categoryId: row.category_id,
    appliesFrom: row.applies_from,
    createdAt: row.created_at,
  };
}

export function categoryRuleToInsertRow(r: CategoryRule): CategoryRuleRow {
  return {
    id: r.id,
    household_id: r.householdId,
    match_field: r.matchField,
    match_type: r.matchType,
    match_value: r.matchValue,
    category_id: r.categoryId,
    applies_from: r.appliesFrom,
    created_at: r.createdAt,
  };
}

export interface CategoryBudgetRow {
  id: string;
  household_id: string;
  category_id: string;
  monthly_amount: number;
  created_at: string;
  updated_at: string;
}

export function rowToCategoryBudget(row: CategoryBudgetRow): CategoryBudget {
  return {
    id: row.id,
    householdId: row.household_id,
    categoryId: row.category_id,
    monthlyAmount: row.monthly_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function categoryBudgetToInsertRow(b: CategoryBudget): CategoryBudgetRow {
  return {
    id: b.id,
    household_id: b.householdId,
    category_id: b.categoryId,
    monthly_amount: b.monthlyAmount,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  };
}

export interface FinanceSettingsRow {
  household_id: string;
  target_monthly_income: number | null;
  updated_at: string;
}

export function rowToFinanceSettings(row: FinanceSettingsRow): FinanceSettings {
  return {
    householdId: row.household_id,
    targetMonthlyIncome: row.target_monthly_income,
    updatedAt: row.updated_at,
  };
}

export function financeSettingsToInsertRow(s: FinanceSettings): FinanceSettingsRow {
  return {
    household_id: s.householdId,
    target_monthly_income: s.targetMonthlyIncome,
    updated_at: s.updatedAt,
  };
}

export interface TransactionRow {
  id: string;
  household_id: string;
  account_id: string;
  occurred_at: string;
  posted_at: string | null;
  amount: number;
  type: string;
  category_id: string | null;
  merchant: string | null;
  description: string | null;
  notes: string;
  status: string;
  excluded_from_reports: boolean;
  linked_transaction_id: string | null;
  source: string;
  import_batch_id: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  trashed_at: string | null;
  permanently_delete_after: string | null;
  plaid_transaction_id: string | null;
  user_edited: boolean;
  merchant_logo_url: string | null;
}

export function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    occurredAt: row.occurred_at,
    postedAt: row.posted_at,
    amount: row.amount,
    type: row.type as TransactionType,
    categoryId: row.category_id,
    merchant: row.merchant,
    description: row.description,
    notes: row.notes,
    status: row.status as TransactionStatus,
    excludedFromReports: row.excluded_from_reports,
    linkedTransactionId: row.linked_transaction_id,
    source: row.source as TransactionSource,
    importBatchId: row.import_batch_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
    plaidTransactionId: row.plaid_transaction_id,
    userEdited: row.user_edited,
    merchantLogoUrl: row.merchant_logo_url,
  };
}

export function transactionToInsertRow(t: Transaction): TransactionRow {
  return {
    id: t.id,
    household_id: t.householdId,
    account_id: t.accountId,
    occurred_at: t.occurredAt,
    posted_at: t.postedAt,
    amount: t.amount,
    type: t.type,
    category_id: t.categoryId,
    merchant: t.merchant,
    description: t.description,
    notes: t.notes,
    status: t.status,
    excluded_from_reports: t.excludedFromReports,
    linked_transaction_id: t.linkedTransactionId,
    source: t.source,
    import_batch_id: t.importBatchId,
    created_by_user_id: t.createdByUserId,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
    trashed_at: t.trashedAt,
    permanently_delete_after: t.permanentlyDeleteAfter,
    plaid_transaction_id: t.plaidTransactionId,
    user_edited: t.userEdited,
    merchant_logo_url: t.merchantLogoUrl,
  };
}

// ---------------------------------------------------------------------------
// Bank sync (docs/Bank Sync Addendum.md §3/§4) — PlaidItemRow includes
// access_token because it's the true shape of the DB row (only ever read
// with the admin client, server-side); rowToPlaidItem() intentionally
// does NOT map it onto PlaidItem, which is the access-token-stripped
// shape actually returned to the client by GET /api/v1/plaid/items.
// ---------------------------------------------------------------------------

export interface PlaidItemRow {
  id: string;
  household_id: string;
  plaid_item_id: string;
  access_token: string;
  institution_id: string | null;
  institution_name: string | null;
  cursor: string | null;
  status: string;
  error_code: string | null;
  created_by_user_id: string;
  created_at: string;
  last_synced_at: string | null;
}

export function rowToPlaidItem(row: PlaidItemRow): PlaidItem {
  return {
    id: row.id,
    householdId: row.household_id,
    institutionId: row.institution_id,
    institutionName: row.institution_name,
    status: row.status as PlaidItemStatus,
    errorCode: row.error_code,
    createdAt: row.created_at,
    lastSyncedAt: row.last_synced_at,
  };
}

export interface RecurringBillRow {
  id: string;
  household_id: string;
  name: string;
  expected_amount: number;
  frequency: string;
  next_due_date: string;
  category_id: string | null;
  account_id: string | null;
  owner_user_id: string | null;
  is_debt_payment: boolean;
  is_active: boolean;
  trashed_at: string | null;
  permanently_delete_after: string | null;
}

export function rowToRecurringBill(row: RecurringBillRow): RecurringBill {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    expectedAmount: row.expected_amount,
    frequency: row.frequency as RecurringBillFrequency,
    nextDueDate: row.next_due_date,
    categoryId: row.category_id,
    accountId: row.account_id,
    ownerUserId: row.owner_user_id,
    isDebtPayment: row.is_debt_payment,
    isActive: row.is_active,
    trashedAt: row.trashed_at,
    permanentlyDeleteAfter: row.permanently_delete_after,
  };
}

export function recurringBillToInsertRow(b: RecurringBill): RecurringBillRow {
  return {
    id: b.id,
    household_id: b.householdId,
    name: b.name,
    expected_amount: b.expectedAmount,
    frequency: b.frequency,
    next_due_date: b.nextDueDate,
    category_id: b.categoryId,
    account_id: b.accountId,
    owner_user_id: b.ownerUserId,
    is_debt_payment: b.isDebtPayment,
    is_active: b.isActive,
    trashed_at: b.trashedAt,
    permanently_delete_after: b.permanentlyDeleteAfter,
  };
}

export interface FinanceBillShareRow {
  id: string;
  household_id: string;
  bill_id: string;
  shared_with_user_id: string;
  shared_by_user_id: string;
  created_at: string;
}

export function rowToFinanceBillShare(row: FinanceBillShareRow): FinanceBillShare {
  return {
    id: row.id,
    householdId: row.household_id,
    billId: row.bill_id,
    sharedWithUserId: row.shared_with_user_id,
    sharedByUserId: row.shared_by_user_id,
    createdAt: row.created_at,
  };
}

export function financeBillShareToInsertRow(s: FinanceBillShare): FinanceBillShareRow {
  return {
    id: s.id,
    household_id: s.householdId,
    bill_id: s.billId,
    shared_with_user_id: s.sharedWithUserId,
    shared_by_user_id: s.sharedByUserId,
    created_at: s.createdAt,
  };
}

export interface RecurringCandidateDismissalRow {
  id: string;
  household_id: string;
  account_id: string;
  candidate_key: string;
  dismissed_by_user_id: string;
  dismissed_at: string;
}

export function rowToRecurringCandidateDismissal(row: RecurringCandidateDismissalRow): RecurringCandidateDismissal {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    candidateKey: row.candidate_key,
    dismissedByUserId: row.dismissed_by_user_id,
    dismissedAt: row.dismissed_at,
  };
}

export function recurringCandidateDismissalToInsertRow(d: RecurringCandidateDismissal): RecurringCandidateDismissalRow {
  return {
    id: d.id,
    household_id: d.householdId,
    account_id: d.accountId,
    candidate_key: d.candidateKey,
    dismissed_by_user_id: d.dismissedByUserId,
    dismissed_at: d.dismissedAt,
  };
}

export interface AccountBalanceSnapshotRow {
  id: string;
  account_id: string;
  balance: number;
  as_of_date: string;
  source: string;
  created_at: string;
}

export function rowToAccountBalanceSnapshot(row: AccountBalanceSnapshotRow): AccountBalanceSnapshot {
  return {
    id: row.id,
    accountId: row.account_id,
    balance: row.balance,
    asOfDate: row.as_of_date,
    source: row.source as AccountBalanceSnapshot["source"],
    createdAt: row.created_at,
  };
}

export function accountBalanceSnapshotToInsertRow(s: AccountBalanceSnapshot): AccountBalanceSnapshotRow {
  return {
    id: s.id,
    account_id: s.accountId,
    balance: s.balance,
    as_of_date: s.asOfDate,
    source: s.source,
    created_at: s.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Receipt scanning (supabase/migrations/0011_receipt_scanning.sql).
// ---------------------------------------------------------------------------

export interface ReceiptScanBatchRow {
  id: string;
  household_id: string;
  source_image_paths: string[];
  status: string;
  detected_count: number;
  confirmed_count: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
  source: string;
}

export function rowToReceiptScanBatch(row: ReceiptScanBatchRow): ReceiptScanBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    sourceImagePaths: row.source_image_paths,
    status: row.status as ReceiptScanBatchStatus,
    detectedCount: row.detected_count,
    confirmedCount: row.confirmed_count,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    source: row.source === "email" ? "email" : "scan",
  };
}

export function receiptScanBatchToInsertRow(b: ReceiptScanBatch): ReceiptScanBatchRow {
  return {
    id: b.id,
    household_id: b.householdId,
    source_image_paths: b.sourceImagePaths,
    status: b.status,
    detected_count: b.detectedCount,
    confirmed_count: b.confirmedCount,
    created_by_user_id: b.createdByUserId,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    source: b.source,
  };
}

export interface ScannedTransactionDraftRow {
  id: string;
  household_id: string;
  batch_id: string;
  store: string | null;
  suggested_date: string | null;
  subtotal_cents: number | null;
  tax_cents: number | null;
  suggested_amount_cents: number | null;
  suggested_category_id: string | null;
  category_source: string | null;
  confidence: number | null;
  needs_review: boolean;
  review_reason: string | null;
  bounding_box: BoundingBoxLike | null;
  photo_index: number;
  status: string;
  resulting_transaction_id: string | null;
  account_id: string | null;
}

export function rowToScannedTransactionDraft(row: ScannedTransactionDraftRow): ScannedTransactionDraft {
  return {
    id: row.id,
    householdId: row.household_id,
    batchId: row.batch_id,
    store: row.store,
    suggestedDate: row.suggested_date,
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    suggestedAmountCents: row.suggested_amount_cents,
    suggestedCategoryId: row.suggested_category_id,
    categorySource: row.category_source as CategorySource | null,
    confidence: row.confidence,
    needsReview: row.needs_review,
    reviewReason: row.review_reason,
    boundingBox: row.bounding_box,
    photoIndex: row.photo_index,
    status: row.status as ScannedTransactionDraftStatus,
    resultingTransactionId: row.resulting_transaction_id,
    accountId: row.account_id,
  };
}

export function scannedTransactionDraftToInsertRow(d: ScannedTransactionDraft): ScannedTransactionDraftRow {
  return {
    id: d.id,
    household_id: d.householdId,
    batch_id: d.batchId,
    store: d.store,
    suggested_date: d.suggestedDate,
    subtotal_cents: d.subtotalCents,
    tax_cents: d.taxCents,
    suggested_amount_cents: d.suggestedAmountCents,
    suggested_category_id: d.suggestedCategoryId,
    category_source: d.categorySource,
    confidence: d.confidence,
    needs_review: d.needsReview,
    review_reason: d.reviewReason,
    bounding_box: d.boundingBox,
    photo_index: d.photoIndex,
    status: d.status,
    resulting_transaction_id: d.resultingTransactionId,
    account_id: d.accountId,
  };
}

export interface ScannedReceiptLineItemRow {
  id: string;
  household_id: string;
  draft_id: string | null;
  transaction_id: string | null;
  raw_item: string;
  standard_name: string | null;
  brand: string | null;
  category_guess_id: string | null;
  subcategory_guess_id: string | null;
  subcategory_guess_text: string | null;
  quantity: number;
  unit_price_cents: number | null;
  line_total_cents: number | null;
  confidence: number | null;
  refund_transaction_id: string | null;
  refunded_amount_cents: number | null;
}

export function rowToScannedReceiptLineItem(row: ScannedReceiptLineItemRow): ScannedReceiptLineItem {
  return {
    id: row.id,
    householdId: row.household_id,
    draftId: row.draft_id,
    transactionId: row.transaction_id,
    rawItem: row.raw_item,
    standardName: row.standard_name,
    brand: row.brand,
    categoryGuessId: row.category_guess_id,
    subcategoryGuessId: row.subcategory_guess_id,
    subcategoryGuessText: row.subcategory_guess_text,
    quantity: row.quantity,
    unitPriceCents: row.unit_price_cents,
    lineTotalCents: row.line_total_cents,
    confidence: row.confidence,
    refundTransactionId: row.refund_transaction_id,
    refundedAmountCents: row.refunded_amount_cents,
  };
}

export function scannedReceiptLineItemToInsertRow(li: ScannedReceiptLineItem): ScannedReceiptLineItemRow {
  return {
    id: li.id,
    household_id: li.householdId,
    draft_id: li.draftId,
    transaction_id: li.transactionId,
    raw_item: li.rawItem,
    standard_name: li.standardName,
    brand: li.brand,
    category_guess_id: li.categoryGuessId,
    subcategory_guess_id: li.subcategoryGuessId,
    subcategory_guess_text: li.subcategoryGuessText,
    quantity: li.quantity,
    unit_price_cents: li.unitPriceCents,
    line_total_cents: li.lineTotalCents,
    confidence: li.confidence,
    refund_transaction_id: li.refundTransactionId,
    refunded_amount_cents: li.refundedAmountCents,
  };
}

export interface TransactionAttachmentRow {
  id: string;
  household_id: string;
  transaction_id: string;
  storage_path: string;
  content_type: string;
  size_bytes: number;
  source_draft_id: string | null;
  created_by_user_id: string;
  created_at: string;
}

export function rowToTransactionAttachment(row: TransactionAttachmentRow): TransactionAttachment {
  return {
    id: row.id,
    householdId: row.household_id,
    transactionId: row.transaction_id,
    storagePath: row.storage_path,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    sourceDraftId: row.source_draft_id,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export function transactionAttachmentToInsertRow(a: TransactionAttachment): TransactionAttachmentRow {
  return {
    id: a.id,
    household_id: a.householdId,
    transaction_id: a.transactionId,
    storage_path: a.storagePath,
    content_type: a.contentType,
    size_bytes: a.sizeBytes,
    source_draft_id: a.sourceDraftId,
    created_by_user_id: a.createdByUserId,
    created_at: a.createdAt,
  };
}

export interface TransactionCategoryRow {
  id: string;
  household_id: string;
  transaction_id: string;
  category_id: string;
  created_at: string;
}

export function rowToTransactionCategory(row: TransactionCategoryRow): TransactionCategory {
  return {
    id: row.id,
    householdId: row.household_id,
    transactionId: row.transaction_id,
    categoryId: row.category_id,
    createdAt: row.created_at,
  };
}

export function transactionCategoryToInsertRow(tc: TransactionCategory): TransactionCategoryRow {
  return {
    id: tc.id,
    household_id: tc.householdId,
    transaction_id: tc.transactionId,
    category_id: tc.categoryId,
    created_at: tc.createdAt,
  };
}

export interface ItemPurchaseRow {
  id: string;
  household_id: string;
  item_id: string;
  transaction_id: string | null;
  scanned_receipt_line_item_id: string | null;
  source: string;
  linked_by_user_id: string;
  linked_at: string;
}

export function rowToItemPurchase(row: ItemPurchaseRow): ItemPurchase {
  return {
    id: row.id,
    householdId: row.household_id,
    itemId: row.item_id,
    transactionId: row.transaction_id,
    scannedReceiptLineItemId: row.scanned_receipt_line_item_id,
    source: row.source as ItemPurchaseSource,
    linkedByUserId: row.linked_by_user_id,
    linkedAt: row.linked_at,
  };
}

export function itemPurchaseToInsertRow(p: ItemPurchase): ItemPurchaseRow {
  return {
    id: p.id,
    household_id: p.householdId,
    item_id: p.itemId,
    transaction_id: p.transactionId,
    scanned_receipt_line_item_id: p.scannedReceiptLineItemId,
    source: p.source,
    linked_by_user_id: p.linkedByUserId,
    linked_at: p.linkedAt,
  };
}

export interface CsvImportBatchRow {
  id: string;
  household_id: string;
  account_id: string;
  file_name: string;
  column_mapping: Record<string, string>;
  imported_at: string | null;
  row_count: number;
  duplicate_count: number;
  status: string;
  created_by_user_id: string;
  created_at: string;
}

export function rowToCsvImportBatch(row: CsvImportBatchRow): CsvImportBatch {
  return {
    id: row.id,
    householdId: row.household_id,
    accountId: row.account_id,
    fileName: row.file_name,
    columnMapping: row.column_mapping,
    importedAt: row.imported_at,
    rowCount: row.row_count,
    duplicateCount: row.duplicate_count,
    status: row.status as CsvImportBatchStatus,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
  };
}

export function csvImportBatchToInsertRow(b: CsvImportBatch): CsvImportBatchRow {
  return {
    id: b.id,
    household_id: b.householdId,
    account_id: b.accountId,
    file_name: b.fileName,
    column_mapping: b.columnMapping,
    imported_at: b.importedAt,
    row_count: b.rowCount,
    duplicate_count: b.duplicateCount,
    status: b.status,
    created_by_user_id: b.createdByUserId,
    created_at: b.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Push notifications (supabase/migrations/0016_push_notifications.sql)
// ---------------------------------------------------------------------------

export interface PushSubscriptionRow {
  id: string;
  household_id: string;
  user_id: string;
  endpoint: string;
  p256dh_key: string;
  auth_key: string;
  device_label: string | null;
  created_at: string;
  last_seen_at: string;
}

export function rowToPushDeviceSubscription(row: PushSubscriptionRow): PushDeviceSubscription {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    endpoint: row.endpoint,
    p256dhKey: row.p256dh_key,
    authKey: row.auth_key,
    deviceLabel: row.device_label,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export interface NotificationPreferenceRow {
  id: string;
  household_id: string;
  user_id: string;
  domain_key: string;
  event_type: string;
  channel: string;
  enabled: boolean;
  updated_at: string;
}

export function rowToNotificationPreference(row: NotificationPreferenceRow): NotificationPreference {
  return {
    id: row.id,
    householdId: row.household_id,
    userId: row.user_id,
    domainKey: row.domain_key,
    eventType: row.event_type,
    channel: row.channel as NotificationPreference["channel"],
    enabled: row.enabled,
    updatedAt: row.updated_at,
  };
}
