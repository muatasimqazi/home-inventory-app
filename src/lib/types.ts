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
  /** Human-facing "Bin ID" (e.g. GAR-234). Stable across moves; separate from tagToken. */
  displayCode: string | null;
  coverPhotoEmoji?: string;
  createdByUserId: string;
  createdAt: string;
  status: EntityLifecycleStatus;
  trashedAt?: string | null;
  permanentlyDeleteAfter?: string | null;
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
  status: ItemStatus;
  needsReview: boolean;
  reviewReason?: string;
  tagIds: string[];
  /** Category-scoped extra fields (e.g. { serialNumber: "..." }), keyed by field key from CATEGORY_EXTRA_FIELDS. */
  extraDetails: Record<string, string>;
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

export interface Breadcrumb {
  locationId: string | null;
  locationName: string | null;
  containerPath: { id: string; name: string }[];
}
