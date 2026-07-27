"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { getSupabaseBrowserClient } from "./supabase/client";
import { id, newId, tagToken } from "./id";
import { isDisplayCodeTaken, nextDisplayCode, normalizeDisplayCode } from "./display-code";
import { ATTACHMENT_MAX_SIZE_BYTES, ATTACHMENT_MAX_SIZE_LABEL, isAttachmentTypeAllowed } from "./attachment-limits";
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
  type HouseholdRow,
  type MemberRow,
  type InviteRow,
  type LocationRow,
  type ContainerRow,
  type ItemRow,
  type TagRow,
  type FavoriteRow,
  type ActivityLogRow,
} from "./supabase/mappers";
import type {
  ActivityAction,
  ActivityEntityType,
  ActivityLogEntry,
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
import type { SupabaseClient } from "@supabase/supabase-js";

// Supabase-backed data layer, Stage 3 of the mock -> real migration
// (identity + core inventory). Households, members, invites, locations,
// containers, items, tags, favorites, and the activity log are real rows
// in the linked Supabase project (supabase/migrations/0001_init.sql,
// 0002_accept_invite_by_email.sql) — RLS enforces household scoping the
// same way it would for a direct API call.
//
// Attachments, label batches, and normalization rules stay exactly as
// they were (in-memory only, scoped to the current session) — attachments
// need a real Supabase Storage bucket that doesn't exist yet, and label
// batches/normalization rules are simply out of scope for this pass. A
// freshly created or joined real household just starts with empty arrays
// for these instead of seed data.
//
// Mutations are optimistic: local state updates immediately (same instant
// UX the mock always had), the write is fired at Supabase in the
// background, and a failure reverts the optimistic change and toasts an
// error. The handful of actions whose result already gates UI right now —
// assignDisplayCode, acceptInvite, leaveHousehold, createHousehold — need
// a real answer, not a guess, so they're properly async/awaited instead.

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
  currentUserId: string;
  currentUserEmail: string;
  lastUsedDestination: { locationId: string | null; containerId: string | null } | null;

  isHydrated: boolean;
  hydrationError: string | null;
  /** Fetches the real signed-in user's households/membership and the current household's full bundle. Safe to call more than once — no-ops once hydrated, shares an in-flight call. */
  hydrate: () => Promise<void>;

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
  /** Assigns `code` if provided (validated for per-household uniqueness), otherwise generates the next code for the container's location. Real, awaited: uniqueness can only be answered by the database. */
  assignDisplayCode: (containerId: string, code?: string) => Promise<{ ok: boolean; error?: string; code?: string }>;
  /** Marks a container's NFC tag as linked (native write or the iOS Shortcuts fallback both call this — same end state). */
  linkNfcTag: (containerId: string) => void;

  // Attachments (still mock/local — no Supabase Storage bucket yet)
  addAttachment: (itemId: string, input: {
    kind: AttachmentKind;
    fileName: string;
    storagePath: string;
    contentType: string;
    sizeBytes: number;
  }) => { ok: boolean; error?: string; attachment?: Attachment };
  deleteAttachment: (attachmentId: string) => void;

  // Label batches (still mock/local)
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

  // Normalization (still mock/local)
  findNormalizationRule: (rawName: string) => NormalizationRule | undefined;
  saveNormalizationRule: (rawPattern: string, canonicalName: string, category: string) => void;

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
    lastUsedDestination: state.lastUsedDestination,
  };
}

/** Fetches everything scoped to one household in parallel. Attachments/label batches/normalization rules aren't real yet (see file header) — they always come back empty for a freshly fetched household. */
async function fetchHouseholdBundle(
  supabase: SupabaseClient,
  householdId: string,
  userId: string
): Promise<HouseholdBundle> {
  const [membersRes, invitesRes, locationsRes, containersRes, itemsRes, tagsRes, favoritesRes, activityRes] =
    await Promise.all([
      supabase.from("members").select("*").eq("household_id", householdId),
      supabase.from("invites").select("*").eq("household_id", householdId),
      supabase.from("locations").select("*").eq("household_id", householdId),
      supabase.from("containers").select("*").eq("household_id", householdId),
      supabase.from("items").select("*, item_tags(tag_id)").eq("household_id", householdId),
      supabase.from("tags").select("*").eq("household_id", householdId),
      supabase.from("favorites").select("*, items!inner(household_id)").eq("user_id", userId).eq("items.household_id", householdId),
      supabase.from("activity_log").select("*").eq("household_id", householdId).order("created_at", { ascending: false }).limit(500),
    ]);

  const firstError =
    membersRes.error ?? invitesRes.error ?? locationsRes.error ?? containersRes.error ?? itemsRes.error ?? tagsRes.error ?? favoritesRes.error ?? activityRes.error;
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
    attachments: [],
    labelBatches: [],
    labelBatchEntries: [],
    normalizationRules: [],
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

export const useInventoryStore = create<InventoryState>()((set, get) => {
  // Households the user belongs to besides the active one, keyed by id —
  // an in-memory cache of already-fetched bundles so switching back and
  // forth within a session doesn't re-fetch every time. Not shared across
  // reloads or other tabs; a cold hydrate() always fetches fresh.
  const otherHouseholdCache: Record<string, HouseholdBundle> = {};

  let hydratePromise: Promise<void> | null = null;

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
    })().finally(() => {
      hydratePromise = null;
    });

    return hydratePromise;
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
          return { ok: false, error: `Bin ID "${resolved}" is already in use.` };
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
        get().logActivity({ entityType: "container", entityId: containerId, entityName: container.name, action: "edited", detail: `Bin ID set to ${resolved}` });
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
    return { ok: false, error: "Couldn't assign a Bin ID after a few attempts — try again." };
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

    if (!changed) return;
    set({ items, containers, locations });
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
