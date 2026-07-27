"use client";

import { create } from "zustand";
import { id, tagToken } from "./id";
import { isDisplayCodeTaken, nextDisplayCode, normalizeDisplayCode } from "./display-code";
import { ATTACHMENT_MAX_SIZE_BYTES, ATTACHMENT_MAX_SIZE_LABEL, isAttachmentTypeAllowed } from "./attachment-limits";
import {
  CURRENT_USER_ID,
  invitableHouseholds,
  otherHouseholdSeedData,
  seedActivity,
  seedAttachments,
  seedContainers,
  seedFavorites,
  seedHouseholds,
  seedInvites,
  seedItems,
  seedLabelBatches,
  seedLabelBatchEntries,
  seedLocations,
  seedMembers,
  seedNormalizationRules,
  seedTags,
  type HouseholdSeedBundle,
} from "./seed";
import type {
  ActivityAction,
  ActivityEntityType,
  Attachment,
  AttachmentKind,
  Container,
  Favorite,
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
  Tag,
} from "./types";

// In-memory mock data layer. Function names/shapes mirror the future
// /api/v1/* endpoints (PRD §23) so swapping to real Supabase later means
// reimplementing these actions, not rewriting call sites. No persistence
// across a hard page reload by design — client-side navigation keeps the
// store intact for the duration of a session, which is what the capture
// -> review -> save -> browse flows in Phase 5 verification need.

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

interface InventoryState {
  /** Every household the current user belongs to. */
  households: Household[];
  /** Which household's data currently occupies the fields below. */
  currentHouseholdId: string;
  members: Member[];
  invites: Invite[];
  locations: Location[];
  containers: Container[];
  items: Item[];
  tags: Tag[];
  normalizationRules: NormalizationRule[];
  activity: ActivityLogAppend[];
  favorites: Favorite[];
  attachments: Attachment[];
  labelBatches: LabelBatch[];
  labelBatchEntries: LabelBatchEntry[];
  currentUserId: string;
  lastUsedDestination: { locationId: string | null; containerId: string | null } | null;

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
  /** Assigns `code` if provided (validated for per-household uniqueness), otherwise generates the next code for the container's location. */
  assignDisplayCode: (containerId: string, code?: string) => { ok: boolean; error?: string };
  /** Marks a container's NFC tag as linked (native write or the iOS Shortcuts fallback both call this — same end state). */
  linkNfcTag: (containerId: string) => void;

  // Attachments
  addAttachment: (itemId: string, input: {
    kind: AttachmentKind;
    fileName: string;
    storagePath: string;
    contentType: string;
    sizeBytes: number;
  }) => { ok: boolean; error?: string; attachment?: Attachment };
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
  /** Adopts a preprinted/unassigned label's tagToken (and a fresh Bin ID, if the container doesn't have one) onto an existing container. */
  claimUnassignedLabel: (entryId: string, containerId: string) => { ok: boolean; error?: string };
  /** Transitions a batch (and every one of its entries) to 'printed' — the actual "this physically went to the printer" moment, distinct from just exporting a PDF. */
  markLabelBatchPrinted: (batchId: string) => void;

  // Tags
  getOrCreateTag: (name: string) => Tag;

  // Normalization
  findNormalizationRule: (rawName: string) => NormalizationRule | undefined;
  saveNormalizationRule: (rawPattern: string, canonicalName: string, category: string) => void;

  // Favorites
  toggleFavorite: (itemId: string) => void;
  isFavorite: (itemId: string) => boolean;

  // Household / members
  /** Creates a brand-new household, adds the current user as its Owner, switches to it, and starts it with empty inventory. */
  createHousehold: (input: { name: string; displayName: string; email: string; avatarUrl?: string }) => Household;
  /** Swaps the active household's data for another one the current user belongs to. No-op if already current. */
  switchHousehold: (householdId: string) => void;
  /** Redeems a pending invite matching `email` for a household the current user isn't a member of yet, joins as a Member, and switches to it. */
  acceptInvite: (email: string, displayName: string) => { ok: boolean; error?: string; household?: Household };
  /** Leaves the current household. Blocked if the caller is its Owner (transfer ownership first) or if it's their only household. */
  leaveHousehold: () => { ok: boolean; error?: string };
  inviteMember: (email: string) => void;
  cancelInvite: (inviteId: string) => void;
  removeMember: (userId: string) => void;
  transferOwnership: (toUserId: string) => void;

  // Activity
  logActivity: (entry: {
    entityType: ActivityEntityType;
    entityId: string;
    entityName: string;
    action: ActivityAction;
    detail?: string;
  }) => void;

  /** Sweeps items/containers/locations whose permanentlyDeleteAfter has passed. Client-side stand-in for the migration's purge_expired_trash() + pg_cron schedule — see store.ts's module-level call below for how this actually gets invoked. */
  purgeExpiredTrash: () => void;
}

export interface ActivityLogAppend {
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

function nowIso(): string {
  return new Date().toISOString();
}

function purgeAfter(from: Date): string {
  const d = new Date(from);
  d.setDate(d.getDate() + TRASH_RETENTION_DAYS);
  return d.toISOString();
}

export const useInventoryStore = create<InventoryState>()((set, get) => {
  // Households the user belongs to besides the active one, keyed by id.
  // Seeded with each household's pristine data up front; switchHousehold()
  // overwrites an entry with the live (possibly edited) snapshot whenever
  // you switch away from it, so edits survive switching back and forth
  // within a session — same "no persistence across a hard reload" scoping
  // as the rest of this mock store.
  const otherHouseholdData: Record<string, HouseholdSeedBundle> = { ...otherHouseholdSeedData };

  // Households with a pending invite the current user hasn't redeemed yet.
  // Mutable local copy (not the imported seed) so a redeemed invite's
  // household is removed from the pool and can't be joined twice.
  const invitablePool: Record<string, { household: Household; bundle: HouseholdSeedBundle }> = { ...invitableHouseholds };

  function snapshotCurrent(state: InventoryState): HouseholdSeedBundle {
    return {
      members: state.members,
      invites: state.invites,
      locations: state.locations,
      containers: state.containers,
      items: state.items,
      tags: state.tags,
      normalizationRules: state.normalizationRules,
      activity: state.activity,
      favorites: state.favorites,
      attachments: state.attachments,
      labelBatches: state.labelBatches,
      labelBatchEntries: state.labelBatchEntries,
      lastUsedDestination: state.lastUsedDestination,
    };
  }

  return {
  households: seedHouseholds,
  currentHouseholdId: seedHouseholds[0].id,
  members: seedMembers,
  invites: seedInvites,
  locations: seedLocations,
  containers: seedContainers,
  items: seedItems,
  tags: seedTags,
  normalizationRules: seedNormalizationRules,
  activity: seedActivity,
  favorites: seedFavorites,
  attachments: seedAttachments,
  labelBatches: seedLabelBatches,
  labelBatchEntries: seedLabelBatchEntries,
  currentUserId: CURRENT_USER_ID,
  lastUsedDestination: { locationId: "loc_garage", containerId: "con_toolbox" },

  createHousehold: (input) => {
    const state = get();
    otherHouseholdData[state.currentHouseholdId] = snapshotCurrent(state);

    const household: Household = { id: id("hh"), name: input.name, createdAt: nowIso() };
    const owner: Member = {
      householdId: household.id,
      userId: state.currentUserId,
      role: "owner",
      joinedAt: nowIso(),
      displayName: input.displayName,
      email: input.email,
      avatarUrl: input.avatarUrl,
    };

    set({
      households: [...state.households, household],
      currentHouseholdId: household.id,
      members: [owner],
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
      lastUsedDestination: null,
    });
    return household;
  },

  switchHousehold: (householdId) => {
    const state = get();
    if (householdId === state.currentHouseholdId) return;
    const next = otherHouseholdData[householdId];
    if (!next) return;

    otherHouseholdData[state.currentHouseholdId] = snapshotCurrent(state);
    set({ currentHouseholdId: householdId, ...next });
  },

  acceptInvite: (email, displayName) => {
    const normalizedEmail = email.trim().toLowerCase();
    const match = Object.entries(invitablePool).find(([, entry]) =>
      entry.bundle.invites.some((inv) => inv.status === "pending" && inv.invitedEmail.toLowerCase() === normalizedEmail)
    );
    if (!match) {
      return { ok: false, error: "No pending invite found for that email in this demo." };
    }
    const [householdId, entry] = match;
    delete invitablePool[householdId];

    const state = get();
    otherHouseholdData[state.currentHouseholdId] = snapshotCurrent(state);

    const invite = entry.bundle.invites.find((inv) => inv.status === "pending" && inv.invitedEmail.toLowerCase() === normalizedEmail)!;
    const joinedAt = nowIso();
    const newMember: Member = {
      householdId,
      userId: state.currentUserId,
      role: "member",
      joinedAt,
      displayName,
      email: invite.invitedEmail,
    };
    const nextBundle: HouseholdSeedBundle = {
      ...entry.bundle,
      members: [...entry.bundle.members, newMember],
      invites: entry.bundle.invites.map((inv) => (inv.id === invite.id ? { ...inv, status: "accepted" } : inv)),
    };

    set({
      households: [...state.households, entry.household],
      currentHouseholdId: householdId,
      ...nextBundle,
    });
    return { ok: true, household: entry.household };
  },

  leaveHousehold: () => {
    const state = get();
    const me = state.members.find((m) => m.userId === state.currentUserId);
    if (!me) return { ok: false, error: "You're not a member of this household." };
    if (me.role === "owner") return { ok: false, error: "Transfer ownership to another member before leaving." };
    if (state.households.length <= 1) return { ok: false, error: "You can't leave your only household." };

    get().logActivity({ entityType: "member", entityId: me.userId, entityName: me.displayName, action: "left" });

    const leavingHouseholdId = state.currentHouseholdId;
    const nextHousehold = state.households.find((h) => h.id !== leavingHouseholdId)!;
    const nextBundle = otherHouseholdData[nextHousehold.id];
    delete otherHouseholdData[leavingHouseholdId];
    delete otherHouseholdData[nextHousehold.id];

    set({
      households: state.households.filter((h) => h.id !== leavingHouseholdId),
      currentHouseholdId: nextHousehold.id,
      ...nextBundle,
    });
    return { ok: true };
  },

  createItem: (input) => {
    const created = buildItem(get().currentHouseholdId, get().currentUserId, input);
    set((s) => ({
      items: [...s.items, created],
      lastUsedDestination: { locationId: input.locationId, containerId: input.containerId },
    }));
    get().logActivity({
      entityType: "item",
      entityId: created.id,
      entityName: created.name,
      action: "created",
    });
    return created;
  },

  createItemsBatch: (inputs) => {
    const created = inputs.map((i) => buildItem(get().currentHouseholdId, get().currentUserId, i));
    const last = inputs[inputs.length - 1];
    set((s) => ({
      items: [...s.items, ...created],
      lastUsedDestination: last
        ? { locationId: last.locationId, containerId: last.containerId }
        : s.lastUsedDestination,
    }));
    created.forEach((it) =>
      get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "created" })
    );
    return created;
  },

  updateItem: (itemId, patch) => {
    const normalizedPatch = patch.quantity !== undefined ? { ...patch, quantity: clampQuantity(patch.quantity) } : patch;
    set((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, ...normalizedPatch, updatedAt: nowIso() } : it)),
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "edited" });
  },

  moveItem: (itemId, dest) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === itemId ? { ...it, locationId: dest.locationId, containerId: dest.containerId, updatedAt: nowIso() } : it
      ),
      lastUsedDestination: dest,
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "moved" });
  },

  archiveItem: (itemId) => {
    set((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, status: "active" === it.status ? "archived" : it.status, updatedAt: nowIso() } : it)),
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "archived" });
  },

  unarchiveItem: (itemId) => {
    set((s) => ({
      items: s.items.map((it) => (it.id === itemId ? { ...it, status: "active", updatedAt: nowIso() } : it)),
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "restored" });
  },

  trashItem: (itemId) => {
    const trashedAt = nowIso();
    set((s) => ({
      items: s.items.map((it) =>
        it.id === itemId
          ? { ...it, status: "trashed", trashedAt, permanentlyDeleteAfter: purgeAfter(new Date(trashedAt)), updatedAt: trashedAt }
          : it
      ),
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "trashed" });
  },

  restoreItem: (itemId) => {
    set((s) => ({
      items: s.items.map((it) =>
        it.id === itemId ? { ...it, status: "active", trashedAt: null, permanentlyDeleteAfter: null, updatedAt: nowIso() } : it
      ),
    }));
    const it = get().items.find((i) => i.id === itemId);
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "restored" });
  },

  permanentlyDeleteItem: (itemId) => {
    const it = get().items.find((i) => i.id === itemId);
    set((s) => ({ items: s.items.filter((i) => i.id !== itemId) }));
    if (it) get().logActivity({ entityType: "item", entityId: it.id, entityName: it.name, action: "deleted_forever" });
  },

  createLocation: (input) => {
    const created: Location = {
      id: id("loc"),
      householdId: get().currentHouseholdId,
      name: input.name,
      description: input.description,
      coverPhotoEmoji: input.coverPhotoEmoji ?? "📦",
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
    };
    set((s) => ({ locations: [...s.locations, created] }));
    get().logActivity({ entityType: "location", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateLocation: (locationId, patch) => {
    set((s) => ({ locations: s.locations.map((l) => (l.id === locationId ? { ...l, ...patch } : l)) }));
  },

  trashLocation: (locationId) => {
    const trashedAt = nowIso();
    const purge = purgeAfter(new Date(trashedAt));
    const containerIds = get()
      .containers.filter((c) => c.locationId === locationId)
      .map((c) => c.id);
    set((s) => ({
      items: s.items.map((it) =>
        it.locationId === locationId
          ? { ...it, status: "trashed", trashedAt, permanentlyDeleteAfter: purge, updatedAt: trashedAt }
          : it
      ),
      locations: s.locations.map((l) =>
        l.id === locationId ? { ...l, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : l
      ),
      containers: s.containers.map((c) =>
        c.locationId === locationId ? { ...c, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : c
      ),
    }));
    void containerIds;
    const loc = get().locations.find((l) => l.id === locationId);
    get().logActivity({
      entityType: "location",
      entityId: locationId,
      entityName: loc?.name ?? "Location",
      action: "trashed",
    });
  },

  restoreLocation: (locationId) => {
    set((s) => ({
      locations: s.locations.map((l) =>
        l.id === locationId ? { ...l, status: "active", trashedAt: null, permanentlyDeleteAfter: null } : l
      ),
    }));
    const loc = get().locations.find((l) => l.id === locationId);
    if (loc) get().logActivity({ entityType: "location", entityId: loc.id, entityName: loc.name, action: "restored" });
  },

  permanentlyDeleteLocation: (locationId) => {
    const loc = get().locations.find((l) => l.id === locationId);
    set((s) => ({ locations: s.locations.filter((l) => l.id !== locationId) }));
    if (loc) get().logActivity({ entityType: "location", entityId: loc.id, entityName: loc.name, action: "deleted_forever" });
  },

  createContainer: (input) => {
    const created: Container = {
      id: id("con"),
      householdId: get().currentHouseholdId,
      locationId: input.locationId,
      parentContainerId: input.parentContainerId ?? null,
      name: input.name,
      description: input.description,
      tagToken: tagToken(),
      displayCode: null,
      coverPhotoEmoji: input.coverPhotoEmoji ?? "📦",
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      status: "active",
      trashedAt: null,
      permanentlyDeleteAfter: null,
      nfcLinkedAt: null,
    };
    set((s) => ({ containers: [...s.containers, created] }));
    get().logActivity({ entityType: "container", entityId: created.id, entityName: created.name, action: "created" });
    return created;
  },

  updateContainer: (containerId, patch) => {
    set((s) => ({ containers: s.containers.map((c) => (c.id === containerId ? { ...c, ...patch } : c)) }));
  },

  moveContainer: (containerId, dest) => {
    // Moving a container carries its whole subtree with it — nested
    // containers and their items still need locationId to reflect where
    // they actually live now, the same invariant the location-sync DB
    // trigger enforces once this is backed by Postgres (§ migration).
    const descendantIds = new Set(collectDescendantContainerIds(get().containers, containerId));
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
    const c = get().containers.find((c) => c.id === containerId);
    if (c) get().logActivity({ entityType: "container", entityId: c.id, entityName: c.name, action: "moved" });
  },

  trashContainer: (containerId) => {
    const trashedAt = nowIso();
    const purge = purgeAfter(new Date(trashedAt));
    const descendantIds = collectDescendantContainerIds(get().containers, containerId);
    const allIds = new Set([containerId, ...descendantIds]);
    const name = get().containers.find((c) => c.id === containerId)?.name ?? "Container";
    set((s) => ({
      items: s.items.map((it) =>
        it.containerId && allIds.has(it.containerId)
          ? { ...it, status: "trashed", trashedAt, permanentlyDeleteAfter: purge, updatedAt: trashedAt }
          : it
      ),
      containers: s.containers.map((c) =>
        allIds.has(c.id) ? { ...c, status: "trashed", trashedAt, permanentlyDeleteAfter: purge } : c
      ),
    }));
    get().logActivity({ entityType: "container", entityId: containerId, entityName: name, action: "trashed" });
  },

  restoreContainer: (containerId) => {
    set((s) => ({
      containers: s.containers.map((c) =>
        c.id === containerId ? { ...c, status: "active", trashedAt: null, permanentlyDeleteAfter: null } : c
      ),
    }));
    const c = get().containers.find((c) => c.id === containerId);
    if (c) get().logActivity({ entityType: "container", entityId: c.id, entityName: c.name, action: "restored" });
  },

  permanentlyDeleteContainer: (containerId) => {
    const c = get().containers.find((c) => c.id === containerId);
    set((s) => ({ containers: s.containers.filter((c) => c.id !== containerId) }));
    if (c) get().logActivity({ entityType: "container", entityId: c.id, entityName: c.name, action: "deleted_forever" });
  },

  assignDisplayCode: (containerId, code) => {
    const containers = get().containers;
    const container = containers.find((c) => c.id === containerId);
    if (!container) return { ok: false, error: "Container not found." };
    const location = get().locations.find((l) => l.id === container.locationId);

    let resolved: string;
    if (code && code.trim()) {
      resolved = normalizeDisplayCode(code);
      if (isDisplayCodeTaken(containers, resolved, containerId)) {
        return { ok: false, error: `Bin ID "${resolved}" is already in use.` };
      }
    } else {
      resolved = nextDisplayCode(containers, location?.name ?? "BIN");
    }

    set((s) => ({
      containers: s.containers.map((c) => (c.id === containerId ? { ...c, displayCode: resolved } : c)),
    }));
    get().logActivity({
      entityType: "container",
      entityId: containerId,
      entityName: container.name,
      action: "edited",
      detail: `Bin ID set to ${resolved}`,
    });
    return { ok: true };
  },

  linkNfcTag: (containerId) => {
    const container = get().containers.find((c) => c.id === containerId);
    if (!container) return;
    set((s) => ({
      containers: s.containers.map((c) => (c.id === containerId ? { ...c, nfcLinkedAt: nowIso() } : c)),
    }));
    get().logActivity({
      entityType: "container",
      entityId: containerId,
      entityName: container.name,
      action: "edited",
      detail: "NFC tag linked",
    });
  },

  addAttachment: (itemId, input) => {
    if (input.sizeBytes > ATTACHMENT_MAX_SIZE_BYTES) {
      return { ok: false, error: `File is too large — max ${ATTACHMENT_MAX_SIZE_LABEL}.` };
    }
    if (!isAttachmentTypeAllowed(input.contentType)) {
      return { ok: false, error: "Only images and PDFs can be attached." };
    }
    const created: Attachment = {
      id: id("att"),
      householdId: get().currentHouseholdId,
      itemId,
      createdByUserId: get().currentUserId,
      createdAt: nowIso(),
      ...input,
    };
    set((s) => ({ attachments: [...s.attachments, created] }));
    return { ok: true, attachment: created };
  },

  deleteAttachment: (attachmentId) => {
    set((s) => ({ attachments: s.attachments.filter((a) => a.id !== attachmentId) }));
  },

  createLabelBatch: (input) => {
    const householdId = get().currentHouseholdId;
    const batch: LabelBatch = {
      id: id("lblb"),
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
        id: id("lble"),
        batchId: batch.id,
        householdId,
        containerId: c.id,
        tagToken: c.tagToken,
        displayCode: c.displayCode,
        status: "assigned",
      }));

    const unassignedEntries: LabelBatchEntry[] = Array.from({ length: Math.max(0, input.unassignedCount) }, () => ({
      id: id("lble"),
      batchId: batch.id,
      householdId,
      containerId: null,
      tagToken: tagToken(),
      displayCode: null,
      status: "unassigned",
    }));

    const entries = [...assignedEntries, ...unassignedEntries];
    set((s) => ({
      labelBatches: [batch, ...s.labelBatches],
      labelBatchEntries: [...s.labelBatchEntries, ...entries],
    }));
    return { batch, entries };
  },

  claimUnassignedLabel: (entryId, containerId) => {
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
    set((s) => ({
      labelBatches: s.labelBatches.map((b) => (b.id === batchId ? { ...b, status: "printed" } : b)),
      labelBatchEntries: s.labelBatchEntries.map((e) => (e.batchId === batchId ? { ...e, status: "printed" } : e)),
    }));
  },

  getOrCreateTag: (name) => {
    const existing = get().tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const created: Tag = { id: id("tag"), householdId: get().currentHouseholdId, name };
    set((s) => ({ tags: [...s.tags, created] }));
    return created;
  },

  findNormalizationRule: (rawName) => {
    const normalized = rawName.trim().toLowerCase();
    return get().normalizationRules.find((r) => r.rawPattern.toLowerCase() === normalized);
  },

  saveNormalizationRule: (rawPattern, canonicalName, category) => {
    const existing = get().normalizationRules.find((r) => r.rawPattern.toLowerCase() === rawPattern.toLowerCase());
    if (existing) {
      set((s) => ({
        normalizationRules: s.normalizationRules.map((r) =>
          r.id === existing.id ? { ...r, canonicalName, category, usageCount: r.usageCount + 1, updatedAt: nowIso() } : r
        ),
      }));
      return;
    }
    const created: NormalizationRule = {
      id: id("rule"),
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
  },

  toggleFavorite: (itemId) => {
    const userId = get().currentUserId;
    const exists = get().favorites.some((f) => f.itemId === itemId && f.userId === userId);
    set((s) => ({
      favorites: exists
        ? s.favorites.filter((f) => !(f.itemId === itemId && f.userId === userId))
        : [...s.favorites, { userId, itemId, createdAt: nowIso() }],
    }));
  },

  isFavorite: (itemId) => {
    const userId = get().currentUserId;
    return get().favorites.some((f) => f.itemId === itemId && f.userId === userId);
  },

  inviteMember: (email) => {
    const created: Invite = {
      id: id("invite"),
      householdId: get().currentHouseholdId,
      invitedEmail: email,
      invitedByUserId: get().currentUserId,
      status: "pending",
      createdAt: nowIso(),
      expiresAt: purgeAfter(new Date()),
    };
    set((s) => ({ invites: [...s.invites, created] }));
    get().logActivity({ entityType: "member", entityId: created.id, entityName: email, action: "invited" });
  },

  cancelInvite: (inviteId) => {
    set((s) => ({ invites: s.invites.filter((i) => i.id !== inviteId) }));
  },

  removeMember: (userId) => {
    const m = get().members.find((m) => m.userId === userId);
    set((s) => ({ members: s.members.filter((m) => m.userId !== userId) }));
    if (m) get().logActivity({ entityType: "member", entityId: userId, entityName: m.displayName, action: "removed" });
  },

  transferOwnership: (toUserId) => {
    set((s) => ({
      members: s.members.map((m) => ({
        ...m,
        role: m.userId === toUserId ? "owner" : m.userId === s.currentUserId ? "member" : m.role,
      })),
    }));
    const m = get().members.find((m) => m.userId === toUserId);
    if (m)
      get().logActivity({
        entityType: "member",
        entityId: toUserId,
        entityName: m.displayName,
        action: "ownership_transferred",
      });
  },

  logActivity: (entry) => {
    const created: ActivityLogAppend = {
      id: id("act"),
      householdId: get().currentHouseholdId,
      actorUserId: get().currentUserId,
      createdAt: nowIso(),
      ...entry,
    };
    set((s) => ({ activity: [created, ...s.activity] }));
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

    if (!changed) return;
    set({ items, containers, locations });
  },
  };
});

// Sweep expired trash once at load (catches anything already past its
// purge date when the app starts) and periodically while the tab stays
// open, so an item that crosses its purge threshold mid-session
// disappears without needing a reload — the closest a client-only mock
// can get to PRD §14's "scheduled job" without a real background worker.
// See purge_expired_trash() + the pg_cron schedule in the migration for
// the real equivalent. Guarded for SSR: this module can be evaluated on
// the server during Next.js's initial render pass, where setInterval
// would just leak a timer in a process that's about to discard it.
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
    id: id("item"),
    householdId,
    locationId: input.locationId,
    containerId: input.containerId,
    name: input.name,
    originalDetectedName: input.originalDetectedName ?? null,
    category: input.category,
    quantity: clampQuantity(input.quantity ?? 1),
    notes: input.notes ?? "",
    photoEmoji: input.photoEmoji,
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
