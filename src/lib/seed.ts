import type {
  ActivityLogEntry,
  Attachment,
  Container,
  Favorite,
  Household,
  Invite,
  Item,
  LabelBatch,
  LabelBatchEntry,
  Location,
  Member,
  NormalizationRule,
  Tag,
} from "./types";

/** Everything scoped to one household — what the store swaps out on switchHousehold(). */
export interface HouseholdSeedBundle {
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
}

// Fixed, deterministic seed data (no Math.random/Date.now at module scope)
// so server and client render the same initial HTML.

export const CURRENT_USER_ID = "user_priya";
const DEV_USER_ID = "user_dev";
const HOUSEHOLD_ID = "hh_shohaz";

export const seedHousehold: Household = {
  id: HOUSEHOLD_ID,
  name: "The Qazi Household",
  createdAt: "2026-05-01T12:00:00.000Z",
};

export const seedMembers: Member[] = [
  {
    householdId: HOUSEHOLD_ID,
    userId: CURRENT_USER_ID,
    role: "owner",
    joinedAt: "2026-05-01T12:00:00.000Z",
    displayName: "Priya",
    email: "priya@example.com",
  },
  {
    householdId: HOUSEHOLD_ID,
    userId: DEV_USER_ID,
    role: "member",
    joinedAt: "2026-05-03T12:00:00.000Z",
    displayName: "Dev",
    email: "dev@example.com",
  },
];

export const seedInvites: Invite[] = [
  {
    id: "invite_1",
    householdId: HOUSEHOLD_ID,
    invitedEmail: "sam@example.com",
    invitedByUserId: CURRENT_USER_ID,
    status: "pending",
    createdAt: "2026-07-18T10:00:00.000Z",
    expiresAt: "2026-08-01T10:00:00.000Z",
  },
];

function location(overrides: Partial<Location> & Pick<Location, "id" | "name">): Location {
  return {
    householdId: HOUSEHOLD_ID,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-05-02T09:00:00.000Z",
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
    ...overrides,
  };
}

function container(overrides: Partial<Container> & Pick<Container, "id" | "name" | "locationId" | "tagToken">): Container {
  return {
    householdId: HOUSEHOLD_ID,
    parentContainerId: null,
    displayCode: null,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-05-04T09:00:00.000Z",
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
    ...overrides,
  };
}

export const seedLocations: Location[] = [
  location({
    id: "loc_garage",
    name: "Garage",
    description: "Main garage, tools and outdoor gear.",
    coverPhotoEmoji: "🚗",
    createdAt: "2026-05-02T09:00:00.000Z",
  }),
  location({
    id: "loc_attic",
    name: "Attic",
    description: "Seasonal storage.",
    coverPhotoEmoji: "🏠",
    createdAt: "2026-05-02T09:05:00.000Z",
  }),
  location({
    id: "loc_office",
    name: "Office",
    description: "Home office and documents.",
    coverPhotoEmoji: "🗄️",
    createdByUserId: DEV_USER_ID,
    createdAt: "2026-05-02T09:10:00.000Z",
  }),
];

export const seedContainers: Container[] = [
  container({
    id: "con_toolbox",
    locationId: "loc_garage",
    name: "Toolbox",
    tagToken: "SHZ-TLBX2AQ9",
    displayCode: "GAR-001",
    createdAt: "2026-05-04T09:00:00.000Z",
  }),
  container({
    id: "con_toolbox_drawer2",
    locationId: "loc_garage",
    parentContainerId: "con_toolbox",
    name: "Drawer 2",
    tagToken: "SHZ-DRW2K7ZP",
    displayCode: "GAR-002",
    createdAt: "2026-05-04T09:02:00.000Z",
  }),
  container({
    id: "con_workbench_shelf",
    locationId: "loc_garage",
    name: "Workbench Shelf",
    tagToken: "SHZ-WBS4M2QT",
    displayCode: null,
    createdAt: "2026-05-04T09:05:00.000Z",
  }),
  container({
    id: "con_holiday_bin",
    locationId: "loc_attic",
    name: "Holiday Decor Bin",
    tagToken: "SHZ-HOL9X3RT",
    displayCode: "ATT-001",
    createdAt: "2026-05-05T09:00:00.000Z",
  }),
  container({
    id: "con_offseason_bin",
    locationId: "loc_attic",
    name: "Off-Season Clothes Bin",
    tagToken: "SHZ-OSC7Y4WK",
    displayCode: "ATT-002",
    createdByUserId: DEV_USER_ID,
    createdAt: "2026-05-05T09:05:00.000Z",
  }),
  container({
    id: "con_box2",
    locationId: "loc_office",
    name: "Box 2",
    tagToken: "SHZ-BOX2N8LM",
    displayCode: "OFF-001",
    createdByUserId: DEV_USER_ID,
    createdAt: "2026-05-06T09:00:00.000Z",
  }),
  container({
    id: "con_desk_drawer",
    locationId: "loc_office",
    name: "Desk Drawer",
    tagToken: "SHZ-DSK5P2VC",
    displayCode: null,
    createdAt: "2026-05-06T09:05:00.000Z",
  }),
];

export const seedTags: Tag[] = [
  { id: "tag_power_tools", householdId: HOUSEHOLD_ID, name: "power-tools" },
  { id: "tag_safety", householdId: HOUSEHOLD_ID, name: "safety" },
  { id: "tag_travel", householdId: HOUSEHOLD_ID, name: "travel" },
  { id: "tag_important", householdId: HOUSEHOLD_ID, name: "important" },
  { id: "tag_seasonal", householdId: HOUSEHOLD_ID, name: "seasonal" },
];

function item(overrides: Partial<Item> & Pick<Item, "id" | "name" | "category" | "locationId" | "containerId" | "photoEmoji">): Item {
  return {
    householdId: HOUSEHOLD_ID,
    originalDetectedName: null,
    quantity: 1,
    notes: "",
    status: "active",
    needsReview: false,
    tagIds: [],
    extraDetails: {},
    ownerUserId: null,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-06-01T10:00:00.000Z",
    updatedAt: "2026-06-01T10:00:00.000Z",
    trashedAt: null,
    permanentlyDeleteAfter: null,
    ...overrides,
  };
}

export const seedItems: Item[] = [
  item({
    id: "item_drill",
    name: "Cordless Drill",
    originalDetectedName: "cordless drill",
    category: "Tool",
    locationId: "loc_garage",
    containerId: "con_toolbox",
    photoEmoji: "🛠️",
    tagIds: ["tag_power_tools"],
    extraDetails: { modelNumber: "DCD771C2", batteryType: "20V Lithium-Ion" },
    ownerUserId: DEV_USER_ID,
    createdAt: "2026-06-10T14:00:00.000Z",
    updatedAt: "2026-06-10T14:00:00.000Z",
  }),
  item({
    id: "item_goggles",
    name: "Safety Goggles",
    originalDetectedName: "safety goggles",
    category: "Tool",
    locationId: "loc_garage",
    containerId: "con_toolbox",
    photoEmoji: "🥽",
    tagIds: ["tag_safety"],
    ownerUserId: DEV_USER_ID,
    createdAt: "2026-06-11T14:00:00.000Z",
    updatedAt: "2026-06-11T14:00:00.000Z",
  }),
  item({
    id: "item_tape_measure",
    name: "Tape Measure",
    category: "Tool",
    locationId: "loc_garage",
    containerId: "con_toolbox_drawer2",
    photoEmoji: "📏",
    createdAt: "2026-06-12T14:00:00.000Z",
    updatedAt: "2026-06-12T14:00:00.000Z",
  }),
  item({
    id: "item_ext_cord",
    name: "Extension Cord",
    category: "Electronics",
    locationId: "loc_garage",
    containerId: "con_workbench_shelf",
    photoEmoji: "🔌",
    createdAt: "2026-06-13T14:00:00.000Z",
    updatedAt: "2026-06-13T14:00:00.000Z",
  }),
  item({
    id: "item_tent",
    name: "Camping Tent",
    category: "Outdoor",
    locationId: "loc_garage",
    containerId: null,
    photoEmoji: "⛺",
    createdAt: "2026-06-14T14:00:00.000Z",
    updatedAt: "2026-06-14T14:00:00.000Z",
  }),
  item({
    id: "item_helmet",
    name: "Bike Helmet",
    category: "Sporting Goods",
    locationId: "loc_garage",
    containerId: null,
    photoEmoji: "🚴",
    ownerUserId: CURRENT_USER_ID,
    createdAt: "2026-06-15T14:00:00.000Z",
    updatedAt: "2026-06-15T14:00:00.000Z",
  }),
  item({
    id: "item_passport",
    name: "Passport",
    originalDetectedName: "passport",
    category: "Document",
    locationId: "loc_office",
    containerId: "con_box2",
    photoEmoji: "🛂",
    tagIds: ["tag_travel", "tag_important"],
    extraDetails: { expirationDate: "2031-03-14", issuer: "U.S. Department of State" },
    ownerUserId: CURRENT_USER_ID,
    createdAt: "2026-06-16T14:00:00.000Z",
    updatedAt: "2026-06-16T14:00:00.000Z",
  }),
  item({
    id: "item_birth_cert",
    name: "birth certificate (unverified)",
    originalDetectedName: "birth certificate (unverified)",
    category: "Document",
    locationId: "loc_office",
    containerId: "con_box2",
    photoEmoji: "📄",
    needsReview: true,
    reviewReason: "Confidence 0.58 is below 0.75.",
    tagIds: ["tag_important"],
    createdAt: "2026-07-19T11:00:00.000Z",
    updatedAt: "2026-07-19T11:00:00.000Z",
  }),
  item({
    id: "item_stapler",
    name: "Stapler",
    category: "Miscellaneous",
    locationId: "loc_office",
    containerId: "con_desk_drawer",
    photoEmoji: "📎",
    createdAt: "2026-06-18T14:00:00.000Z",
    updatedAt: "2026-06-18T14:00:00.000Z",
  }),
  item({
    id: "item_charger",
    name: "Laptop Charger",
    category: "Electronics",
    locationId: "loc_office",
    containerId: "con_desk_drawer",
    photoEmoji: "🔋",
    ownerUserId: CURRENT_USER_ID,
    createdAt: "2026-06-19T14:00:00.000Z",
    updatedAt: "2026-06-19T14:00:00.000Z",
  }),
  item({
    id: "item_lights",
    name: "String Lights",
    category: "Decor",
    locationId: "loc_attic",
    containerId: "con_holiday_bin",
    photoEmoji: "✨",
    tagIds: ["tag_seasonal"],
    createdAt: "2026-06-20T14:00:00.000Z",
    updatedAt: "2026-06-20T14:00:00.000Z",
  }),
  item({
    id: "item_ornaments",
    name: "ornament box (assorted)",
    originalDetectedName: "ornament box (assorted)",
    category: "Decor",
    locationId: "loc_attic",
    containerId: "con_holiday_bin",
    photoEmoji: "🎄",
    needsReview: true,
    reviewReason: "The model marked this item for review.",
    tagIds: ["tag_seasonal"],
    createdAt: "2026-07-20T11:00:00.000Z",
    updatedAt: "2026-07-20T11:00:00.000Z",
  }),
  item({
    id: "item_coats",
    name: "Winter Coats",
    category: "Clothing",
    locationId: "loc_attic",
    containerId: "con_offseason_bin",
    photoEmoji: "🧥",
    createdAt: "2026-06-21T14:00:00.000Z",
    updatedAt: "2026-06-21T14:00:00.000Z",
  }),
  item({
    id: "item_snowboots",
    name: "snow boots pair",
    originalDetectedName: "snow boots pair",
    category: "Clothing",
    locationId: "loc_attic",
    containerId: "con_offseason_bin",
    photoEmoji: "🥾",
    needsReview: true,
    reviewReason: "Confidence 0.61 is below 0.75.",
    createdAt: "2026-07-21T11:00:00.000Z",
    updatedAt: "2026-07-21T11:00:00.000Z",
  }),
  item({
    id: "item_boardgames",
    name: "Board Games",
    category: "Toy",
    locationId: "loc_attic",
    containerId: null,
    photoEmoji: "🎲",
    quantity: 4,
    createdAt: "2026-06-22T14:00:00.000Z",
    updatedAt: "2026-06-22T14:00:00.000Z",
  }),
  item({
    id: "item_old_router",
    name: "Old Router",
    category: "Electronics",
    locationId: "loc_office",
    containerId: "con_desk_drawer",
    photoEmoji: "📡",
    status: "archived",
    createdAt: "2026-05-10T14:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00.000Z",
  }),
  item({
    id: "item_umbrella",
    name: "Broken Umbrella",
    category: "Miscellaneous",
    locationId: "loc_garage",
    containerId: null,
    photoEmoji: "🌂",
    status: "trashed",
    createdAt: "2026-05-15T14:00:00.000Z",
    updatedAt: "2026-07-21T09:00:00.000Z",
    trashedAt: "2026-07-21T09:00:00.000Z",
    permanentlyDeleteAfter: "2026-08-20T09:00:00.000Z",
  }),
  item({
    id: "item_coupons",
    name: "Expired Coupons",
    category: "Document",
    locationId: "loc_office",
    containerId: null,
    photoEmoji: "🧾",
    status: "trashed",
    createdAt: "2026-05-20T14:00:00.000Z",
    updatedAt: "2026-06-28T09:00:00.000Z",
    trashedAt: "2026-06-28T09:00:00.000Z",
    permanentlyDeleteAfter: "2026-07-28T09:00:00.000Z",
  }),
];

export const seedNormalizationRules: NormalizationRule[] = [
  {
    id: "rule_drill",
    householdId: HOUSEHOLD_ID,
    rawPattern: "cordless drill",
    canonicalName: "Cordless Drill",
    category: "Tool",
    source: "learned",
    usageCount: 3,
    createdAt: "2026-05-12T10:00:00.000Z",
    updatedAt: "2026-06-10T14:00:00.000Z",
  },
  {
    id: "rule_phillips",
    householdId: HOUSEHOLD_ID,
    rawPattern: "phillips screwdriver",
    canonicalName: "Phillips Screwdriver",
    category: "Tool",
    source: "manual",
    usageCount: 1,
    createdAt: "2026-05-14T10:00:00.000Z",
    updatedAt: "2026-05-14T10:00:00.000Z",
  },
];

export const seedLabelBatches: LabelBatch[] = [];
export const seedLabelBatchEntries: LabelBatchEntry[] = [];

export const seedFavorites: Favorite[] = [
  { userId: CURRENT_USER_ID, itemId: "item_helmet", createdAt: "2026-06-16T10:00:00.000Z" },
  { userId: CURRENT_USER_ID, itemId: "item_passport", createdAt: "2026-06-17T10:00:00.000Z" },
];

export const seedAttachments: Attachment[] = [
  {
    id: "att_passport_scan",
    householdId: HOUSEHOLD_ID,
    itemId: "item_passport",
    kind: "other",
    fileName: "passport-scan.pdf",
    storagePath: "mock://attachments/passport-scan.pdf",
    contentType: "application/pdf",
    sizeBytes: 482_000,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-06-16T15:00:00.000Z",
  },
  {
    id: "att_drill_manual",
    householdId: HOUSEHOLD_ID,
    itemId: "item_drill",
    kind: "manual",
    fileName: "cordless-drill-manual.pdf",
    storagePath: "mock://attachments/cordless-drill-manual.pdf",
    contentType: "application/pdf",
    sizeBytes: 1_240_000,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-06-10T15:00:00.000Z",
  },
  {
    id: "att_drill_receipt",
    householdId: HOUSEHOLD_ID,
    itemId: "item_drill",
    kind: "receipt",
    fileName: "home-depot-receipt.jpg",
    storagePath: "mock://attachments/home-depot-receipt.jpg",
    contentType: "image/jpeg",
    sizeBytes: 210_000,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-06-10T15:05:00.000Z",
  },
];

export const seedActivity: ActivityLogEntry[] = [
  {
    id: "act_1",
    householdId: HOUSEHOLD_ID,
    actorUserId: CURRENT_USER_ID,
    entityType: "item",
    entityId: "item_drill",
    entityName: "Cordless Drill",
    action: "created",
    createdAt: "2026-06-10T14:00:00.000Z",
  },
  {
    id: "act_2",
    householdId: HOUSEHOLD_ID,
    actorUserId: DEV_USER_ID,
    entityType: "item",
    entityId: "item_passport",
    entityName: "Passport",
    action: "created",
    createdAt: "2026-06-16T14:00:00.000Z",
  },
  {
    id: "act_3",
    householdId: HOUSEHOLD_ID,
    actorUserId: CURRENT_USER_ID,
    entityType: "item",
    entityId: "item_old_router",
    entityName: "Old Router",
    action: "archived",
    createdAt: "2026-07-01T09:00:00.000Z",
  },
  {
    id: "act_4",
    householdId: HOUSEHOLD_ID,
    actorUserId: DEV_USER_ID,
    entityType: "item",
    entityId: "item_coupons",
    entityName: "Expired Coupons",
    action: "trashed",
    createdAt: "2026-06-28T09:00:00.000Z",
  },
  {
    id: "act_5",
    householdId: HOUSEHOLD_ID,
    actorUserId: CURRENT_USER_ID,
    entityType: "item",
    entityId: "item_umbrella",
    entityName: "Broken Umbrella",
    action: "trashed",
    createdAt: "2026-07-21T09:00:00.000Z",
  },
  {
    id: "act_6",
    householdId: HOUSEHOLD_ID,
    actorUserId: CURRENT_USER_ID,
    entityType: "item",
    entityId: "item_snowboots",
    entityName: "snow boots pair",
    action: "created",
    detail: "Flagged for review",
    createdAt: "2026-07-21T11:00:00.000Z",
  },
];

// ---------------------------------------------------------------------------
// A second household — demonstrates that a user (Priya) can belong to more
// than one household at once, each with its own separate roster and
// inventory. Deliberately minimal (one location, one bin, two items):
// enough to prove switching actually changes what you see, not a full
// second demo dataset to maintain in parallel with the one above.
// ---------------------------------------------------------------------------

const HOUSEHOLD_KHAN_ID = "hh_khan";

export const seedHouseholdKhan: Household = {
  id: HOUSEHOLD_KHAN_ID,
  name: "Khan Home",
  createdAt: "2026-07-10T09:00:00.000Z",
};

export const seedHouseholds: Household[] = [seedHousehold, seedHouseholdKhan];

const seedMembersKhan: Member[] = [
  {
    householdId: HOUSEHOLD_KHAN_ID,
    userId: CURRENT_USER_ID,
    role: "owner",
    joinedAt: "2026-07-10T09:00:00.000Z",
    displayName: "Priya",
    email: "priya@example.com",
  },
];

const seedLocationsKhan: Location[] = [
  {
    id: "loc_khan_garage",
    householdId: HOUSEHOLD_KHAN_ID,
    name: "Garage",
    description: "Tools and seasonal storage.",
    coverPhotoEmoji: "🚗",
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-07-10T09:05:00.000Z",
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  },
];

const seedContainersKhan: Container[] = [
  {
    id: "con_khan_garage_bin2",
    householdId: HOUSEHOLD_KHAN_ID,
    locationId: "loc_khan_garage",
    parentContainerId: null,
    name: "Garage Bin 2",
    tagToken: "SHZ-KHNGB2X1",
    displayCode: "GAR-234",
    coverPhotoEmoji: "📦",
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-07-10T09:10:00.000Z",
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  },
];

const seedItemsKhan: Item[] = [
  {
    id: "item_khan_tires",
    householdId: HOUSEHOLD_KHAN_ID,
    locationId: "loc_khan_garage",
    containerId: "con_khan_garage_bin2",
    name: "Winter Tires",
    originalDetectedName: null,
    category: "Outdoor",
    quantity: 4,
    notes: "",
    photoEmoji: "🛞",
    status: "active",
    needsReview: false,
    tagIds: [],
    extraDetails: {},
    ownerUserId: CURRENT_USER_ID,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-07-10T09:15:00.000Z",
    updatedAt: "2026-07-10T09:15:00.000Z",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  },
  {
    id: "item_khan_ladder",
    householdId: HOUSEHOLD_KHAN_ID,
    locationId: "loc_khan_garage",
    containerId: "con_khan_garage_bin2",
    name: "Extension Ladder",
    originalDetectedName: null,
    category: "Tool",
    quantity: 1,
    notes: "",
    photoEmoji: "🪜",
    status: "active",
    needsReview: false,
    tagIds: [],
    extraDetails: {},
    ownerUserId: null,
    createdByUserId: CURRENT_USER_ID,
    createdAt: "2026-07-10T09:16:00.000Z",
    updatedAt: "2026-07-10T09:16:00.000Z",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  },
];

const seedActivityKhan: ActivityLogEntry[] = [
  {
    id: "act_khan_1",
    householdId: HOUSEHOLD_KHAN_ID,
    actorUserId: CURRENT_USER_ID,
    entityType: "household",
    entityId: HOUSEHOLD_KHAN_ID,
    entityName: "Khan Home",
    action: "created",
    createdAt: "2026-07-10T09:00:00.000Z",
  },
];

/** Household 1 (hh_shohaz) is the default active household, loaded directly
 * into the store's top-level state — see store.ts. This map only holds the
 * *other* households' data, lazily swapped in on switchHousehold(). */
export const otherHouseholdSeedData: Record<string, HouseholdSeedBundle> = {
  [HOUSEHOLD_KHAN_ID]: {
    members: seedMembersKhan,
    invites: [],
    locations: seedLocationsKhan,
    containers: seedContainersKhan,
    items: seedItemsKhan,
    tags: [],
    normalizationRules: [],
    activity: seedActivityKhan,
    favorites: [],
    attachments: [],
    labelBatches: [],
    labelBatchEntries: [],
  },
};

// ---------------------------------------------------------------------------
// A third household Priya is NOT a member of yet — demonstrates the "join
// with invite code" flow actually joining a real household, not just
// failing gracefully. She was invited by its owner (a different person,
// "Alex Chen") and can redeem that invite from household-setup's join mode
// using her own email (priya@example.com).
// ---------------------------------------------------------------------------

const HOUSEHOLD_CHEN_ID = "hh_chen";
const CHEN_OWNER_USER_ID = "user_alex_chen";

const seedHouseholdChen: Household = {
  id: HOUSEHOLD_CHEN_ID,
  name: "The Chen House",
  createdAt: "2026-07-15T10:00:00.000Z",
};

const seedMembersChen: Member[] = [
  {
    householdId: HOUSEHOLD_CHEN_ID,
    userId: CHEN_OWNER_USER_ID,
    role: "owner",
    joinedAt: "2026-07-15T10:00:00.000Z",
    displayName: "Alex Chen",
    email: "alex@example.com",
  },
];

const seedInvitesChen: Invite[] = [
  {
    id: "invite_chen_priya",
    householdId: HOUSEHOLD_CHEN_ID,
    invitedEmail: "priya@example.com",
    invitedByUserId: CHEN_OWNER_USER_ID,
    status: "pending",
    createdAt: "2026-07-20T10:00:00.000Z",
    expiresAt: "2026-08-20T10:00:00.000Z",
  },
];

const seedLocationsChen: Location[] = [
  {
    id: "loc_chen_living_room",
    householdId: HOUSEHOLD_CHEN_ID,
    name: "Living Room",
    coverPhotoEmoji: "🛋️",
    createdByUserId: CHEN_OWNER_USER_ID,
    createdAt: "2026-07-15T10:05:00.000Z",
    status: "active",
    trashedAt: null,
    permanentlyDeleteAfter: null,
  },
];

/** Households with a pending invite to someone who isn't a member yet —
 * separate from otherHouseholdSeedData, which only holds households the
 * current user already belongs to. acceptInvite() in store.ts is the only
 * way one of these moves into `households[]`. */
export const invitableHouseholds: Record<string, { household: Household; bundle: HouseholdSeedBundle }> = {
  [HOUSEHOLD_CHEN_ID]: {
    household: seedHouseholdChen,
    bundle: {
      members: seedMembersChen,
      invites: seedInvitesChen,
      locations: seedLocationsChen,
      containers: [],
      items: [],
      tags: [],
      normalizationRules: [],
      activity: [],
      favorites: [],
      attachments: [],
      labelBatches: [],
      labelBatchEntries: [],
    },
  },
};
