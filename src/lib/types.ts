// Data model mirrors the Postgres schema in PRD §22, kept as plain
// client-side types for now (mock data layer) so the shape survives the
// later swap to a real Supabase-backed API.

export type Role = "owner" | "member";

export interface Household {
  id: string;
  name: string;
  createdAt: string;
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
  | "member";

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
