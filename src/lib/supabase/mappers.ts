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
  Location,
  Container,
  Item,
  Tag,
  Favorite,
  ActivityLogEntry,
} from "../types";

export interface HouseholdRow {
  id: string;
  name: string;
  created_at: string;
}

export function rowToHousehold(row: HouseholdRow): Household {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

export interface MemberRow {
  household_id: string;
  user_id: string;
  role: string;
  joined_at: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
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
  };
}

export interface LocationRow {
  id: string;
  household_id: string;
  name: string;
  description: string | null;
  cover_photo_emoji: string | null;
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
    created_by_user_id: loc.createdByUserId,
    created_at: loc.createdAt,
    status: loc.status,
    trashed_at: loc.trashedAt ?? null,
    permanently_delete_after: loc.permanentlyDeleteAfter ?? null,
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
  photo_emoji: string;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
  extra_details: Record<string, string>;
  owner_user_id: string | null;
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
    photoEmoji: row.photo_emoji,
    status: row.status as Item["status"],
    needsReview: row.needs_review,
    reviewReason: row.review_reason ?? undefined,
    tagIds,
    extraDetails: row.extra_details,
    ownerUserId: row.owner_user_id,
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
    photo_emoji: it.photoEmoji,
    status: it.status,
    needs_review: it.needsReview,
    review_reason: it.reviewReason ?? null,
    extra_details: it.extraDetails,
    owner_user_id: it.ownerUserId,
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
