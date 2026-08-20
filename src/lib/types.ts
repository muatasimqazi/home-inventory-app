// Data model mirrors the Postgres schema in PRD §22, kept as plain
// client-side types for now (mock data layer) so the shape survives the
// later swap to a real Supabase-backed API.

/** 30-day Trash retention (PRD §14) — shared by store.ts's client-side purgeAfter() and any server-side trash-writer (e.g. lib/plaid/sync.ts's removed-transaction handling, Bank Sync Addendum §6) that needs the identical purge horizon without importing the "use client" store module. */
export const TRASH_RETENTION_DAYS = 30;

export type Role = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  createdAt: string;
  /** Opaque local-part for this household's email-receipts forwarding address (token@receipts.<domain>) — never the household's own id, so the address itself doesn't leak it. */
  receiptsToken: string;
}

export interface Member {
  householdId: string;
  userId: string;
  role: Role;
  joinedAt: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

export type InviteStatus = "pending" | "accepted" | "expired";

export interface Invite {
  id: string;
  householdId: string;
  invitedEmail: string;
  invitedByUserId: string;
  status: InviteStatus;
  createdAt: string;
  expiresAt: string;
}

export type EntityLifecycleStatus = "active" | "trashed";

export interface Location {
  id: string;
  householdId: string;
  name: string;
  description?: string;
  coverPhotoEmoji?: string;
  /** Path within the public "item-photos" Storage bucket (shared across items/locations/containers) — null falls back to coverPhotoEmoji. */
  coverPhotoPath: string | null;
  createdByUserId: string;
  createdAt: string;
  status: EntityLifecycleStatus;
  trashedAt?: string | null;
  permanentlyDeleteAfter?: string | null;
}

export interface Container {
  id: string;
  householdId: string;
  locationId: string;
  parentContainerId?: string | null;
  name: string;
  description?: string;
  tagToken: string;
  /** Human-facing "Container ID" (e.g. GAR-234). Stable across moves; separate from tagToken. */
  displayCode: string | null;
  coverPhotoEmoji?: string;
  /** Path within the public "item-photos" Storage bucket (shared across items/locations/containers) — null falls back to coverPhotoEmoji. */
  coverPhotoPath: string | null;
  createdByUserId: string;
  createdAt: string;
  status: EntityLifecycleStatus;
  trashedAt?: string | null;
  permanentlyDeleteAfter?: string | null;
  /** When an NFC tag was linked to this container (native write, or written by another device and read natively on iOS) — null if only the QR label has been set up. */
  nfcLinkedAt: string | null;
}

export type ItemStatus = "active" | "archived" | "trashed";

export const CATEGORIES = [
  "Tool",
  "Electronics",
  "Document",
  "Clothing",
  "Kitchen",
  "Sporting Goods",
  "Toy",
  "Decor",
  "Hardware",
  "Outdoor",
  "Miscellaneous",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Alphabetical, for every category dropdown — CATEGORIES itself stays in its original (arbitrary, not meaningfully ordered) declaration order since nothing about the type depends on it, but a picker rendering it directly was exactly the kind of "dropdown not sorted" a user actually notices. Computed once at module load, not per-render, since the source array is static. */
export const SORTED_CATEGORIES = [...CATEGORIES].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

export interface Item {
  id: string;
  householdId: string;
  locationId: string | null;
  containerId: string | null;
  name: string;
  originalDetectedName: string | null;
  category: string;
  quantity: number;
  notes: string;
  photoEmoji: string;
  /** Path within the public "item-photos" Storage bucket (shared across items/locations/containers) — null falls back to photoEmoji. */
  coverPhotoPath: string | null;
  status: ItemStatus;
  needsReview: boolean;
  reviewReason?: string;
  tagIds: string[];
  /** Category-scoped extra fields (e.g. { serialNumber: "..." }), keyed by field key from CATEGORY_EXTRA_FIELDS. */
  extraDetails: Record<string, string>;
  /** Which household member this item personally belongs to. null = shared/household item, not owned by one person. */
  ownerUserId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  trashedAt?: string | null;
  permanentlyDeleteAfter?: string | null;
}

export type AttachmentKind = "receipt" | "manual" | "warranty" | "other";

export interface Attachment {
  id: string;
  householdId: string;
  itemId: string;
  kind: AttachmentKind;
  fileName: string;
  /** Mock object URL (blob: or data:) standing in for real storage path until Supabase Storage exists. */
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  createdByUserId: string;
  createdAt: string;
}

export interface Tag {
  id: string;
  householdId: string;
  name: string;
}

export type NormalizationSource = "learned" | "manual";

export interface NormalizationRule {
  id: string;
  householdId: string;
  rawPattern: string;
  canonicalName: string;
  category: string;
  source: NormalizationSource;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ActivityEntityType =
  | "item"
  | "container"
  | "location"
  | "household"
  | "member"
  | "account"
  | "transaction"
  | "category"
  | "recurring_bill";

export type ActivityAction =
  | "created"
  | "edited"
  | "moved"
  | "archived"
  | "trashed"
  | "restored"
  | "deleted_forever"
  | "invited"
  | "joined"
  | "removed"
  | "left"
  | "ownership_transferred";

export interface ActivityLogEntry {
  id: string;
  householdId: string;
  actorUserId: string;
  entityType: ActivityEntityType;
  entityId: string;
  entityName: string;
  action: ActivityAction;
  detail?: string;
  createdAt: string;
}

export interface Favorite {
  userId: string;
  itemId: string;
  createdAt: string;
}

export type LabelPaperPreset = "small-3up" | "medium-2up" | "large-1up";
export type LabelToggle = "qr" | "qr-code" | "qr-code-name";
/** 'draft' isn't reachable via the current UI (createLabelBatch always finalizes a batch in one step — there's no save-for-later flow) but the type/schema still support it as the PRD-specified starting state, not just what today's one screen happens to produce. */
export type LabelBatchStatus = "draft" | "generated" | "printed";
export type LabelBatchEntryStatus = "unassigned" | "assigned" | "printed";

export interface LabelBatch {
  id: string;
  householdId: string;
  createdByUserId: string;
  createdAt: string;
  paperPreset: LabelPaperPreset;
  toggle: LabelToggle;
  includeLocation: boolean;
  /** Print offset, in mm, to nudge the grid for printer alignment. */
  offsetX: number;
  offsetY: number;
  status: LabelBatchStatus;
}

export interface LabelBatchEntry {
  id: string;
  batchId: string;
  householdId: string;
  /** null = unassigned/preprinted — claimable onto a container later. */
  containerId: string | null;
  tagToken: string;
  displayCode: string | null;
  /** Derived from containerId, not independently settable — 'assigned' iff containerId is set, until markLabelBatchPrinted() cascades 'printed' down from the batch. */
  status: LabelBatchEntryStatus;
}

export interface Breadcrumb {
  locationId: string | null;
  locationName: string | null;
  containerPath: { id: string; name: string }[];
}

// ---------------------------------------------------------------------------
// Finance domain (supabase/migrations/0010_finance_schema.sql, docs/Personal
// Finance PRD.md, docs/Personal Finance Addendum.md "Privacy model").
//
// Privacy model, load-bearing for every screen that lists/renders these:
// `ownerUserId: null` = joint/household, visible to everyone. Set = personal,
// private by default to that member — RLS already filters what actually
// comes back from Supabase, so client code never re-implements the
// visibility check; it only needs to know a row *can* be personal, to
// render the right badge/sharing UI.
// ---------------------------------------------------------------------------

export type AccountType = "checking" | "savings" | "credit_card" | "cash" | "loan" | "mortgage" | "investment";
export type FinanceLifecycleStatus = "active" | "archived" | "trashed";

export interface Account {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  institutionName: string | null;
  /** Denormalized, kept live by a Postgres trigger on `transactions` — never write this directly from a balance-editing form. */
  currentBalance: number;
  /** Manual (credit cards, etc.) — never auto-overwritten by the balance trigger (PRD §14). */
  availableBalance: number | null;
  startingBalance: number;
  /** Receipt Scanning Addendum §6 — drives receipt→account auto-matching. Also populated from Plaid's account `mask` on link (Bank Sync Addendum §5), so a Plaid-linked account benefits from the same matching. */
  cardLastFour: string | null;
  /** null = joint/household account. Set = personal, private by default to this member. */
  ownerUserId: string | null;
  status: FinanceLifecycleStatus;
  openedAt: string | null;
  trashedAt: string | null;
  permanentlyDeleteAfter: string | null;
  /** Bank Sync Addendum §3/§8 — null for every non-Plaid account. Set together: an account is either fully Plaid-linked (both set) or not (both null), never one without the other. */
  plaidItemId: string | null;
  plaidAccountId: string | null;
}

/** Explicit per-member opt-in grant onto a personal account. No row = not shared with that member. */
export interface FinanceAccountShare {
  id: string;
  householdId: string;
  accountId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

export interface AccountBalanceSnapshot {
  id: string;
  accountId: string;
  balance: number;
  asOfDate: string;
  source: "scheduled" | "manual";
  createdAt: string;
}

export type FinanceCategoryStatus = "active" | "archived" | "trashed";

/** Named `FinanceCategory` (not `Category`) to avoid colliding with the existing item-category union above — a full household-editable entity, not a fixed string literal set. Household-wide, no privacy (Addendum: "a shared categorization taxonomy isn't the kind of thing that needs privacy"). */
export interface FinanceCategory {
  id: string;
  /** null = system default category, shared/read-only across every household. */
  householdId: string | null;
  name: string;
  parentCategoryId: string | null;
  isDefault: boolean;
  status: FinanceCategoryStatus;
  trashedAt: string | null;
  permanentlyDeleteAfter: string | null;
}

export interface CategoryRule {
  id: string;
  householdId: string;
  matchField: "merchant" | "description";
  matchType: "contains" | "exact";
  matchValue: string;
  categoryId: string;
  /** Forward-only (PRD §16/§32.1) — never applied retroactively. */
  appliesFrom: string;
  createdAt: string;
}

export type TransactionType = "expense" | "income" | "transfer" | "payment" | "refund";
export type TransactionStatus = "pending" | "posted";
export type TransactionSource = "manual" | "csv_import" | "receipt_scan" | "plaid";

export interface Transaction {
  id: string;
  householdId: string;
  accountId: string;
  occurredAt: string;
  postedAt: string | null;
  /** Signed: negative = money out, positive = money in. */
  amount: number;
  type: TransactionType;
  categoryId: string | null;
  merchant: string | null;
  description: string | null;
  notes: string;
  /** Bank posting state — distinct from the trash lifecycle below. */
  status: TransactionStatus;
  excludedFromReports: boolean;
  /** Self-referencing — both legs of a transfer/payment point at each other. */
  linkedTransactionId: string | null;
  source: TransactionSource;
  importBatchId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  permanentlyDeleteAfter: string | null;
  /** Bank Sync Addendum §3/§6/§7 — null unless this row came from (or was reconciled against) Plaid. Independent of `source`: a receipt-scanned or manually-entered row keeps its original `source` even after Plaid adopts it for reconciliation. */
  plaidTransactionId: string | null;
  /** Bank Sync Addendum §7 — once a household member edits category/merchant/description/notes on a Plaid-sourced (or Plaid-adopted) transaction, a later `modified` sync refreshes amount/date/status only and leaves these fields alone. */
  userEdited: boolean;
}

export type RecurringBillFrequency = "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";

export interface RecurringBill {
  id: string;
  householdId: string;
  name: string;
  expectedAmount: number;
  frequency: RecurringBillFrequency;
  nextDueDate: string;
  categoryId: string | null;
  accountId: string | null;
  /** Same nullable joint-vs-personal shape as Account.ownerUserId. */
  ownerUserId: string | null;
  /** Paused/resumed — distinct from the trash lifecycle below. */
  isActive: boolean;
  trashedAt: string | null;
  permanentlyDeleteAfter: string | null;
}

export interface FinanceBillShare {
  id: string;
  householdId: string;
  billId: string;
  sharedWithUserId: string;
  sharedByUserId: string;
  createdAt: string;
}

export type CsvImportBatchStatus = "pending" | "imported" | "failed";

export interface CsvImportBatch {
  id: string;
  householdId: string;
  accountId: string;
  fileName: string;
  columnMapping: Record<string, string>;
  importedAt: string | null;
  rowCount: number;
  duplicateCount: number;
  status: CsvImportBatchStatus;
  createdByUserId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Bank sync (docs/Bank Sync Addendum.md §3/§4) — PlaidItem is the safe,
// access-token-stripped projection returned by GET /api/v1/plaid/items;
// the real row (with access_token) never reaches the client — see the
// Addendum's security model.
// ---------------------------------------------------------------------------

export type PlaidItemStatus = "active" | "reauth_required" | "error";

export interface PlaidItem {
  id: string;
  householdId: string;
  institutionId: string | null;
  institutionName: string | null;
  status: PlaidItemStatus;
  errorCode: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Receipt scanning (docs/Receipt Scanning Addendum.md §3,
// supabase/migrations/0011_receipt_scanning.sql). Batches/drafts/line-items
// are review-stage only — plain household-membership visibility, not the
// account-privacy predicate accounts/transactions get (see the migration's
// own comment for why). TransactionAttachment inherits real privacy
// through its transaction once a draft is confirmed.
// ---------------------------------------------------------------------------

export type ReceiptScanBatchStatus = "processing" | "ready_for_review" | "confirmed" | "failed";

export interface ReceiptScanBatch {
  id: string;
  householdId: string;
  sourceImagePaths: string[];
  status: ReceiptScanBatchStatus;
  detectedCount: number;
  confirmedCount: number;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  /** How this batch originated — 'scan' (photo capture, the original/default path) or 'email' (forwarded to the household's receipts inbox, no photo at all). Shown in the review UI so a draft with no image never reads as a broken scan. */
  source: "scan" | "email";
}

export type CategorySource = "rule_match" | "ai_suggestion" | "user_corrected";
export type ScannedTransactionDraftStatus = "pending" | "confirmed" | "dismissed";

export interface ScannedTransactionDraft {
  id: string;
  householdId: string;
  batchId: string;
  store: string | null;
  suggestedDate: string | null;
  /** Dollars-and-cents fields stay integer cents at this review stage (Addendum §3) — converted to numeric dollars only once, at confirmation. */
  subtotalCents: number | null;
  taxCents: number | null;
  suggestedAmountCents: number | null;
  suggestedCategoryId: string | null;
  categorySource: CategorySource | null;
  confidence: number | null;
  needsReview: boolean;
  reviewReason: string | null;
  boundingBox: BoundingBoxLike | null;
  photoIndex: number;
  status: ScannedTransactionDraftStatus;
  resultingTransactionId: string | null;
  /** Nullable until resolved via card_last_four match or picked during review (Addendum §6). */
  accountId: string | null;
}

/** Matches lib/ai.ts's BoundingBox shape without importing a client-facing AI module into the shared domain types file. */
export interface BoundingBoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScannedReceiptLineItem {
  id: string;
  householdId: string;
  /** Null for an item added manually straight onto a transaction (0013_manual_line_items.sql) — no AI-extraction review session produced it, so there's no draft to point at. At least one of draftId/transactionId is always set. */
  draftId: string | null;
  transactionId: string | null;
  rawItem: string;
  standardName: string | null;
  brand: string | null;
  categoryGuessId: string | null;
  subcategoryGuessId: string | null;
  subcategoryGuessText: string | null;
  quantity: number;
  unitPriceCents: number | null;
  lineTotalCents: number | null;
  confidence: number | null;
  /** Set together, both or neither (DB constraint) — "returned" is derived from this being non-null, not tracked as a separate status. */
  refundTransactionId: string | null;
  /** This item's own share of the linked refund transaction's total — can differ from lineTotalCents (restocking fee, or one refund covering several items). */
  refundedAmountCents: number | null;
}

export interface TransactionAttachment {
  id: string;
  householdId: string;
  transactionId: string;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sourceDraftId: string | null;
  createdByUserId: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Push notifications (docs/Household Hub Addendum.md §5, generalized per
// docs/Platform Foundation Addendum.md §2) — real Web Push infrastructure,
// built against the domain-agnostic shape those addenda specced so any
// future domain (household_tasks, home automation, ...) plugs in without
// re-deriving its own notification pipeline.
// ---------------------------------------------------------------------------

/** A registered browser/device — named PushDeviceSubscription, not PushSubscription, to avoid colliding with the browser's own native PushSubscription type. */
export interface PushDeviceSubscription {
  id: string;
  householdId: string;
  userId: string;
  endpoint: string;
  p256dhKey: string;
  authKey: string;
  deviceLabel: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/** One row per (user, domain, event type) — e.g. muting 'finance'/'bill.due' without muting every other notification. Defaults to enabled; a household member has to actually turn one off, never opt in blind. */
export interface NotificationPreference {
  id: string;
  householdId: string;
  userId: string;
  domainKey: string;
  eventType: string;
  channel: "push" | "in_app_only";
  enabled: boolean;
  updatedAt: string;
}
