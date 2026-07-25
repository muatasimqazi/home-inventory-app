# Shohaz — Product Requirements Document

Status: DRAFT. This document is in two parts: **Part 1, Product** (what and why — for Figma, product, and design) and **Part 2, Technical Design Appendix** (how — for engineering and AI implementation). Open items are tracked inline and consolidated in §19.

**Implementation note, July 2026:** The Figma `v2 · Current design` canvas now includes the post-Homebox-inspired feature pass, updated navigation structure, and design-system corrections summarized throughout this document. Claude Code should treat this PRD plus the v2 Figma mocks as the current source of truth, not the older concept frames.

---

# PART 1: PRODUCT

## 1. Executive Summary

**Product name:** Shohaz — Balochi for "to find."

**One-paragraph overview:**
Shohaz is "Apple Photos for physical belongings" — a premium, mobile-first, AI-assisted app for cataloging what you own by photographing it, not typing it in. Point the camera at what you're putting away; Shohaz identifies it, proposes a name and category, and files it under the container and location you confirm. The product exists so that finding a specific item takes seconds, and putting one away takes almost no conscious effort — the opposite of how spreadsheets and inventory software feel.

**Target users:** See [§4](#4-target-users--personas).

**Primary use cases:**
1. Find a specific stored item in under 10 seconds without walking through the house.
2. Catalog a newly acquired item, or a box of items being organized into a bin, with near-zero typing.
3. Manage and reorganize the whole household inventory from a proper desktop experience, not just a phone.

---

## 2. Vision & Product Principles

**Problem statement:**
People lose track of where they've stored infrequently-used physical items because the cost of logging an item at put-away time is higher than the perceived future benefit. Existing tools — spreadsheets, generic inventory apps, warehouse/asset-management software — fail because they *feel* like data entry. Shohaz's bet is that if cataloging feels like taking a photo, not filling out a form, people will actually keep doing it, the same way Apple Photos never asks you to file or caption anything and people still end up with a complete, searchable photo library.

**This is not:** a spreadsheet, warehouse software, enterprise inventory/asset-management software, or anything that reads as "systems for organizing systems." **This is closer to:** Apple Photos, Google Photos, Apple Home, Google Lens, Things 3, Notion, Linear — products where the interface gets out of the way and the content (your stuff, found instantly) is the whole experience.

**Product Principles** *(every feature decision is checked against these)*:

| Principle | Meaning |
|---|---|
| AI-first | AI-assisted capture is the default path; manual entry is the fallback, never the primary flow |
| Camera-first | Adding an item starts with the camera, not a form |
| Search-first | The home screen's default state is a search bar, not a browse list |
| Visual-first | Photos, not text rows, are the primary unit of recognition throughout the app — this is closer to a photo grid than a spreadsheet, deliberately |
| Mobile-first for capture, desktop-capable for management | Capture happens on a phone, in the moment; organizing, reviewing, and administering the household inventory is a first-class desktop experience, not a shrunken mobile view — see [§8.6](#86-desktop-experience) |
| Minimal typing | Target: zero *required* text fields to save an item via the AI-assisted path |
| Installable, camera- and offline-capable app | Real installability and reliable camera access on mobile — see [§21](#21-system-architecture) |
| Fast enough to become a habit | Camera-to-saved-item target: **[TODO — needs a real number, validated against actual AI latency, not guessed]** |
| Beautiful enough to enjoy using | See [§3](#3-design-language--experience-principles) — this can no longer be a one-line aspiration |
| Tagging via QR and NFC, same underlying identifier | Every Container carries one identifier, deliverable as a printed QR code and/or a written NFC tag — see [§8.4](#84-containers) |

---

## 3. Design Language & Experience Principles

This section exists because "beautiful enough to enjoy using" is not a design spec. A Figma designer — human or AI — should be able to read this and know what kind of thing to make, the way Apple's Human Interface Guidelines let you infer the shape of an experience before seeing a single screen.

**Reference points, and why:** Apple Photos (content-first, chrome disappears, the photo *is* the interface), Apple Home (calm, spatial, glanceable status), Google Lens (the camera as the primary input, recognition feels instant and a little magical), Things 3 (restraint — every screen has one obvious next action, nothing competes for attention), Linear (fast, keyboard/gesture-friendly, no wasted motion, information density handled with typographic hierarchy rather than clutter), Notion (flexible structure that still feels light).

**Visual hierarchy:** photos dominate. Text is secondary — a name, a location breadcrumb, nothing more, in list contexts. Full detail (notes, tags, activity) is one tap away, never crowded into the primary view. If a screen feels like it has "fields," it's wrong.

**Typography:** a single, restrained system-font scale. Use SF Pro in Figma and on Apple-rendered contexts, with the platform `system-ui` stack elsewhere. Shohaz should not use a decorative display face — the product's personality comes from photography, spatial hierarchy, and motion, not typographic flourish. Headings should feel crisp by using more line-height and restrained weight, not by switching families or increasing boldness. Letter spacing is `0` throughout, and font sizes do not scale directly with viewport width.

| Role | Size / line-height | Font / weight | Primary use |
|---|---:|---|---|
| Display | 30 / 36 | SF Pro Medium | Brand/auth moments only; not ordinary app chrome |
| Desktop title | 26 / 32 | SF Pro Medium | Desktop management page titles |
| Screen title | 22 / 28 | SF Pro Medium | Mobile screen titles and major modal titles |
| Section title | 17 / 23 | SF Pro Medium | Section headers and important card titles |
| Item title | 15 / 20 | SF Pro Medium | Item names, Location/Container names, activity row titles |
| Body | 14 / 19 | SF Pro Regular | Form values, explanatory copy, default controls |
| Body emphasis | 14 / 19 | SF Pro Medium | Buttons, selected tabs, and compact control labels only |
| Caption | 12 / 16 | SF Pro Regular | Breadcrumbs, metadata, helper text |
| Caption emphasis | 12 / 16 | SF Pro Medium | Badges and emphasized metadata only |
| Micro | 11 / 14 | SF Pro Regular | Dense labels and compact metadata |

Typography should create hierarchy through size and spacing first, then modest weight shifts. Bold is intentionally rare; use it only for exceptional brand or confirmation moments, not routine headers. Text in inventory browsing contexts stays minimal: item name, breadcrumb, small metadata. Full detail belongs in detail screens.

**Color:** the current v2 direction is a warm taupe/neutral storage system, inspired by calm household interiors and organized utility storage rather than a literal industrial black/yellow skin. Use a near-white app background, white cards/sheets, taupe primary actions, soft neutral borders, and restrained category accents. Category colors identify data (bin type/category/status) only; they should appear as small dots, 2–3px rails, flat ID chips, or pale tints, never as large UI chrome. Black is reserved for text and rare high-impact utility surfaces, not for the bottom nav or ordinary app background.

**Concrete visual reference (updated this session):** the final v2 mocks moved away from high-contrast black/yellow dominance and into a softer taupe-led product system. The tool-storage influence remains in the bin ID badges, QR/NFC label management, shelf-like card structure, and precise utility controls. The app should feel calm, clean, findable, and physical without reading as warehouse software.

**Iconography:** use one rounded 24px line-icon family across the product; do not use text glyphs as production icons. Icons should be functional and familiar, not illustrative decoration. Stroke color follows the containing surface: white on taupe primary buttons/FABs, primary ink on active light-surface tabs, and muted taupe-gray on inactive nav. The MVP icon set is: Home/Dashboard, Box/Locations/Containers, Heart/Favorites, Settings, Search, Camera, Plus/Add, Close, Chevron right, Chevron down, Arrow left, Edit, Trash, Tag, User/Member, Key/API, QR/Label, Archive, Move, Paperclip/Attachment, File/Text, Download/Export, Printer, Hash/ID, and Layers/Nesting. Avoid adding new icons until a workflow requires them; repeated one-off symbols are a design-system smell.

**Imagery:** every Item, Container, and Location is fundamentally a photo with metadata, not a record with an optional photo. Thumbnails are generously sized, not squeezed into small icon-sized boxes the way inventory apps typically render list items.

**Motion:** purposeful and fast, never decorative. A capture confirmation should feel immediate (§10.2) — motion communicates state changes (saved, moved, synced-pending) rather than adding flourish. Favor spring-based, physical-feeling transitions over linear fades, consistent with the Apple ecosystem reference points above.

**Navigation:** search-first means the primary navigation surface is a persistent search entry point, not a deep tab/menu hierarchy. Bottom navigation (mobile) covers Dashboard/Search, Locations, Favorites, Settings — four items, no more. Deeper structure (a Location's Containers, a Container's Items) is revealed through drill-down and breadcrumbs, not additional top-level navigation.

**Desktop and tablet behavior:** desktop is not mobile stretched wide. It's a management surface — see [§8.6](#86-desktop-experience) for functional requirements. Visually, expect a persistent sidebar (Locations tree), a content area that can show denser list/table views than mobile (appropriate here, since desktop use is deliberate organizing, not quick capture), and multi-select/bulk-action affordances that don't belong on mobile. Tablet sits between the two — likely closer to desktop's information density in landscape, closer to mobile's single-column focus in portrait; this needs real design exploration, not a rule stated here.

**Empty states:** never a blank screen with a caption. Every empty state (§10.4) explains what will appear there and offers the action that fills it, illustrated rather than just worded.

**Loading states:** skeleton screens that mirror the eventual content's shape, never spinners — a spinner communicates "wait," a skeleton communicates "this is what's coming," which matches the calm, confident tone the reference products share.

**Delight:** small, specific moments, not gamification — e.g. the AI correctly identifying something a little obscure should feel a bit magical (Google Lens's best moments), and the capture-confirmation motion (above) should feel satisfying enough that logging ten items in a row doesn't feel like a chore. No streaks, no badges, no points — those read as productivity-software tricks, which is exactly the register this product is avoiding.

**Color tokens (current v2 implementation):**

| Token | Hex | Use |
|---|---:|---|
| `neutral-0` | `#FFFFFF` | Cards, sheets, nav containers, primary content surfaces. |
| `neutral-50` | `#FAF8F6` | Page/app background. |
| `neutral-100` | `#F1EDEA` | Recessed surfaces, inputs, no-photo fallback panels. |
| `neutral-200` | `#E4DDD8` | Default borders and dividers. |
| `neutral-500` | `#8D7B73` | Secondary/caption text and inactive icons. |
| `neutral-900` | `#212121` | Primary text and active light-surface icons. |
| `brand-500` | `#A1887F` | Primary buttons, FABs, active utility states, identity chrome only. Text/icons on this color are white. |
| `brand-700` | `#715C52` | Stronger taupe for emphasis where `brand-500` is too soft. |
| `brand-100` | `#F2EDEA` | Soft branded panels and fallback illustration fills. |
| `brand-200` | `#D0C2BA` | Taupe borders and subtle illustrated bin details. |
| `danger` | `#A31B1B` | Irreversible/destructive confirmations only; not generic category red. |

`#FFE1D1` and `#FFF3C1` are excluded. Do not reintroduce them.

**Category colors** are data accents only. Use pale tints for larger chip fills and darker tones for tiny dots, 2–3px edges, text, or flat ID labels. Large saturated red/green/blue/purple/orange fills are explicitly disallowed because they compete with the taupe system. Bin ID badges are flat, no shadow.

**Corner radius:** consolidate the ~20 ad hoc radius values currently in use to five tokens: `radius-sm` 8, `radius-md` 12, `radius-lg` 16, `radius-xl` 24, `radius-full` 999 (pill). Maps directly to Tailwind's `rounded-lg` / `rounded-xl` / `rounded-2xl` / `rounded-full`.

**Icon library:** Lucide React (24px, rounded stroke) is the concrete recommendation for the "one rounded 24px line-icon family" requirement above. Implementation should use Lucide components or equivalent SVG line icons, never text glyph placeholders. Icon wrapper elements must not carry visible fills unless the wrapper is intentionally a button/chip; color belongs on the vector stroke/fill itself.

**Buttons:** primary actions use solid `brand-500` with white text/icons. Secondary actions use outlined or quiet neutral treatment unless the action is intentionally destructive. Secondary buttons must never visually overpower primary actions. Destructive actions use the dedicated danger treatment and explicit copy.

*[TODO: spacing/elevation tokens, dark mode, and a component-level motion spec still belong in Figma. The typography scale above is now the working product spec and is represented in the Figma file as `00 · Typography System`.]*

**Technical foundation:** Tailwind CSS + shadcn/ui, on Radix primitives (§21). The components are ours to restyle completely — Figma's job is to make sure the result reads as Shohaz, not as a recognizably-default shadcn app, which is a real and common failure mode worth designing against deliberately rather than discovering after launch.

## 4. Target Users & Personas

Household sharing is required for MVP — multiple people edit the same inventory, with at least two role types (Owner, Member).

**Primary persona — Priya, the Household Organizer.** Two kids, storage across garage/attic/basement. She's the one who'd actually open this regularly. If logging an item takes more than a few seconds, she stops within a week — a half-populated inventory is worse than none, because she stops trusting it and reverts to memory.

**Secondary persona — Dev, the Household Member.** Doesn't maintain the inventory, but needs to find things and occasionally put something away. Should never need to learn the app beyond: open, search, done.

**Cut from MVP — Small business owner / SKU-based inventory tracker.** Different needs (SKUs, valuations, check-in/check-out) that pull against the home/household focus and dilute the AI-capture wedge. Revisit only with a specific reason.

**Folded in, not separate — Collector.** "Hundreds of collectibles" is a power-user mode of the Organizer persona, not a distinct workflow. Relevant to search/scale requirements ([§17](#17-non-functional-requirements)), not its own feature set.

*[TODO: these are informed reasoning, not user research — validate before locking scope.]*

## 5. Goals and Success Metrics

Every metric below states what starts it, what ends it, and what event fires it — a metric nobody can actually instrument doesn't belong in a PRD.

| Metric | Instrumentation | Target |
|---|---|---|
| Time to add one item, AI-assisted | Starts: `capture_initiated` (camera opened via the floating button). Ends: `item_saved`. Client-measured elapsed time, p50/p90 reported. | < 15s p50 — **provisional, needs validation against real AI latency, not a committed spec** |
| Time to find an item | Starts: `search_query_started` (first keystroke). Ends: `search_result_opened`. | < 10s p50 |
| Search success rate | `search_result_opened` within the top 3 results, divided by all `search_query_started` sessions that had ≥1 result | ≥ 90% |
| Photo-flow adoption | `item_saved` events where `source = 'ai_capture'` ÷ all `item_saved` events | ≥ 70% |
| Household activation | Count of `item_saved` events per household within 30 days of `household_created` | ≥ 20 |
| AI suggestion acceptance rate | Per reviewed field (name, category, tags): `field_saved_unchanged` ÷ (`field_saved_unchanged` + `field_edited_before_save`), logged at `item_saved`/`items_batch_saved` | No target yet — this *is* the quality signal, tracked from week 1 |
| Batch capture detection recall | Manually audited on a sample: (items actually present in a batch photo that were detected) ÷ (items actually present) — **cannot be fully automated**, requires periodic manual spot-checks against real photos | No target yet — needs a measurement process defined before it can be tracked at all, not just a number |
| Weekly active households | Households with ≥1 authenticated session in a 7-day window | No target yet — track from week 1 for a baseline |

*AI provider cost and quota utilization are tracked as operational metrics in the technical appendix ([§24](#24-ai-integration-details)), not here — those are implementation concerns, not product success measures.*

## 6. Scope (MVP vs Future)

**MVP:**
- Auth (Google + email/password via Supabase Auth); Household creation; invite flow (email-bound, not a bearer link, §13)
- Roles: Owner, Member — see [§22](#22-data-model--database-schema) for the enforced-at-the-database invariant
- Locations → Containers (recursively nestable, including bins containing bins) → Items, plus Items directly in a Location
- AI-assisted capture: photo → detection (single or multiple items, §12) → **mandatory human review** → save. Multi-item-per-photo detection is **in MVP** — see [§12](#12-ai-capture-experience).
- Manual entry fallback
- Server-side search across items, containers, locations, tags, and normalized/alias names — see [§11](#11-search-experience)
- Physical tagging: printable QR + optional written NFC tag per Container, same identifier either way; includes human-readable display codes like `GAR-234`, editable/regeneratable codes, and preprinted/unassigned label workflows
- **Original-detected-name vs. curated-name distinction, needs-review flagging, and manual correction** — the foundation of the normalization workflow ([§8.5](#85-items--normalization)); the *learning* half (corrections auto-becoming rules) ships as soon as the foundation is stable, treated as MVP-adjacent rather than a hard cut
- Archive and Trash (§14) — a complete, unambiguous deletion lifecycle
- Desktop management experience (§8.6) — editing, organizing, printing tags, browsing tags, exporting data, admin — not read-only
- CSV import for migrating from the existing Sheets-based system (§15) — the mapping/dedup UX, not full Shortcuts interoperability
- Export and data-portability flows: inventory CSV, label PDF, photo archive, and full household data export
- Quiet Item Detail attachments: receipt, manual, warranty document, and other file uploads; no OCR/reminder automation in MVP
- Category-scoped extra details: lightweight optional fields shown by category, not a generic custom-field builder
- Activity feed, per-user Favorites, basic undo on destructive actions (§13)

**Explicitly deferred to V2+:**
- Push notifications (in-app activity feed is MVP; push is not, §13)
- Full Shortcuts/Home Assistant integration (stable API and auth are prepared for in MVP per §16, but the integrations themselves are not built)
- AI duplicate detection
- AI-generated container/summary descriptions
- Multiple photos per item
- Multiple households per user
- Full offline-first multi-user write-conflict resolution (optimistic concurrency with conflict *surfacing* is MVP, §13; automatic merge is not)
- Barcode scanning, receipt OCR, maintenance/warranty reminders, shopping list integration, smart reminders

**Cut, not deferred:** small-business/SKU inventory features.

## 7. Information Architecture

```
Household
 └── Member (role: Owner | Member — exactly one Owner, always)
 └── Location
      └── Container (recursive — a Container can contain other Containers)
           └── Item
      └── Item   (an Item can sit directly in a Location with no Container)
```

Supporting concepts: Photo, Attachment, Tag, Normalization Rule (alias/canonical-name mapping), Category-Scoped Extra Detail, Activity Log, Favorite, Invite, Label Batch, Unassigned Label Code, Trash (a state, not a separate hierarchy — see §14).

Two deliberate departures from a naive fixed-depth tree: **Containers nest recursively** (no hardcoded depth — real storage nests: a bin inside a bin inside a closet shelf), and **Items can attach directly to a Location** (a bike leaning in the garage with no box around it needs somewhere to live).

## 8. Functional Requirements

### 8.1 Dashboard
Search-first landing screen: search bar and camera button as the two dominant elements, not a browse-first grid on load. Below the fold: recently-added items (household-wide), quick links to Favorites and Locations. A household with under 5 items shows an onboarding prompt instead of a near-empty "recent" list.

### 8.2 Search
See [§11 Search Experience](#11-search-experience) — search is the product's core differentiator and warrants its own dedicated section rather than a functional-requirements bullet list.

### 8.3 Locations
CRUD; name, optional description, optional cover photo; shows nested Containers and direct Items. Duplicate Location names are allowed with a soft warning, not blocked — breadcrumbs disambiguate collisions automatically (e.g. append creation month) rather than forcing unique names. The v2 design adds a nested browser pattern for Location → Area/Container → sub-Container, with accordion expansion and one room/location open at a time in constrained views.

### 8.4 Containers
Full CRUD (create/update/move/delete, each a distinct operation — "move" is not overloaded to also mean "rename"). Containers are recursively nestable because real storage often has a tote containing smaller bins or pouches. The UI must support bin-within-bin browsing through breadcrumbs and expandable nested lists without assuming a fixed depth.

Every Container has two identifiers:
- **`tagToken`**: opaque, stable, globally unique token encoded in QR/NFC and resolved by `/containers/by-tag/:tagToken`.
- **`displayCode`**: human-readable household code, e.g. `GAR-234`, printed on labels and shown on container cards/detail views. It is stable across moves by default; users may edit/regenerate it when appropriate.

Printable labels can include QR only, QR + display code, or QR + display code + container name. Location is optional on labels because containers move. Label printing is desktop-primary and supports batch selection, paper presets, print offset for partially used sheets, and a live preview grid. Shohaz also supports creating unassigned/preprinted label codes ahead of use, then later assigning an unused code to a Container.

The same identifier can optionally be written to a physical NFC tag by the household — on iOS via Shortcuts' "Write Tags" action, on Android via a comparable app (e.g. "NFC Tools"), with brief in-app instructions for both, since this isn't something the app can do itself (a web app can't write NFC tags on iOS). The identifier is stable across moves — a printed label or written tag stays valid even after the box moves rooms.

### 8.5 Items — & Normalization

Core record type. Every Item carries a normalization workflow — the distinction between what the AI saw and what the household calls it:

- **`originalDetectedName`**: the AI's raw output for this item, captured once, never edited — an audit trail and the input to the learning mechanism below.
- **`name`**: the actual display/search name. Pre-filled from a matching normalization rule if one exists (§22), otherwise from `originalDetectedName`. This is what the user reviews and can edit before saving, per the existing mandatory-review rule.
- **`needsReview`**: set true when confidence is low, or when no normalization rule matched (i.e., a genuinely new item type Shohaz hasn't seen for this household before). Surfaced as a filterable state, not a blocking gate — items still save normally, they're just flagged for later cleanup.
- **Manual corrections become rules**: if a user edits `name` away from what was pre-filled, a light, dismissible prompt ("Remember this?") offers to save the correction as a normalization rule for next time. Declining doesn't block saving — it only affects whether Shohaz gets faster at recognizing that item next time.

Otherwise: create via AI/manual; edit; move; Archive (reversible, excluded from default search) vs. Trash (§14) are distinct; quantity (integer, 0–9999); one primary photo per item in MVP (multiple photos is V2, to keep capture fast and unambiguous); detail view shows photo, breadcrumb, tags, notes, activity history, quiet attachments, and category-scoped extra details.

**Attachments:** Item Detail includes a secondary, collapsed-or-quiet section for Receipt, Manual, Warranty document, and Other file. This is file storage and retrieval only in MVP: no receipt OCR, warranty reminders, maintenance schedules, or document intelligence.

**Category-scoped extra details:** Shohaz should not expose a generic custom-fields builder in MVP. Instead, optional fields appear only where useful by category. Examples: Tools can show model number, battery type, and serial number; Documents can show expiration date and issuer; Electronics can show serial number and warranty end; Clothing can show size. These fields must feel lightweight and secondary, never like the primary reason to use the app.

### 8.6 Desktop Experience

Mobile is the capture surface; desktop is the organization and management surface. Both are fully capable — desktop is not a read-only or secondary view of mobile.

Desktop-specific requirements:
- **Editing**: full edit access to every entity — items, containers, locations, tags, normalization rules.
- **Organizing**: bulk move/re-parent containers, multi-select item operations (bulk tag, bulk move, bulk archive), a denser list/table view of a Location or Container's contents than makes sense on mobile.
- **Reviewing AI suggestions**: the needs-review queue (§8.5) is a genuinely desktop-shaped workflow — triaging a backlog of flagged items is exactly the kind of task that benefits from a keyboard and a wide screen, not a phone.
- **Printing QR labels**: batch-print Container labels (e.g. print a full sheet of labels for a newly-organized closet) — not realistically a mobile task.
- **Managing containers**: the full container hierarchy as a navigable tree, not just drill-down.
- **Browsing tags**: a lightweight tag browser with item counts, useful for power users but not a top-level mobile browsing mode.
- **Data portability**: export inventory CSV, photo archive, label PDF, and full household data export from Settings.
- **Administration**: household member management, ownership transfer, normalization rule management, CSV import (§15), exports, and label-code management — all desktop-shaped tasks.

Desktop does **not** need camera-based capture as a primary flow (a laptop camera capturing a physical item is an awkward, unlikely workflow) — manual entry and bulk operations are the desktop-native ways to add/edit items, while AI photo capture remains mobile's job. This division of labor is deliberate, not a limitation to apologize for.

## 9. User Flows

**1. Searching for an item.** Open app → search focused by default (§8.1) → results ranked and returned server-side as you type (§11) → tap result → item detail with full breadcrumb.

**2. Adding an item, AI-assisted, single or multiple.** Tap camera → capture (one photo can contain one item or several spread-out items, §12) → AI Review: for a single detected item, an editable form; for multiple, an editable, removable list, each with its own AI-cropped thumbnail → Location/Container defaults to last-used (needed for the tap budget in §10 to hold) → edit/remove as needed → Save (single) or Save All (batch, one atomic write) → immediate confirmation, decoupled from network completion → offline: item(s) show "pending sync" until confirmed (§13).

**3. Adding an item, manual fallback.** Reached from denied camera permission or explicit "enter manually" → fill required fields → save, no AI Review step.

**4. Editing an item.** Item detail → Edit → change fields → Save.

**5. Moving an item.** Item detail → Move → pick destination → confirm (≤3 taps) → activity log entry written.

**6. Archiving vs. trashing an item.** Archive (default, reversible, "I don't have this anymore but keep the record") and Trash (§14, "I'm deleting this") are distinct actions with distinct icons/copy — never conflated.

**7. Creating a Container.** Inside a Location → Add Container → name, optional description/photo → Save → QR label generated immediately.

**8. Opening a Container: QR scan or NFC tap.** Both resolve to the same Container-contents view via the same identifier (§8.4) — no functional difference between the two physical tagging methods.

**9. Inviting a household member.** Owner-only → enter email → invite sent → invitee signs in → **acceptance verifies the signed-in email matches the invited email** — an invite is not a bearer token forwardable to anyone.

**10. First sign-in.** No household found → create one (become Owner) or redeem an invite (become Member) → routed to the Dashboard empty-state.

**11. Restoring from Trash.** Trash view (mobile: in Settings; desktop: a persistent sidebar entry, §8.6) → select item/container/location → Restore → returns to its prior state and location, or prompts for a new one if the original no longer exists.

**12. Importing from the existing system (desktop-primary, §15).** Settings → Import → upload CSV → map columns to Shohaz fields → preview → confirm → items/containers/locations created, with a completion summary and a list of anything that needs manual attention (ambiguous rows, unmatched categories).

**13. Printing Container labels (desktop-primary).** Settings or Container tools → Print Labels → select Containers or create unassigned labels → choose paper preset and print offset → choose label content (QR only / QR + display code / QR + display code + name; optional location) → preview grid → export/print PDF.

**14. Managing a Container display code.** Container Detail → Display Code → copy/edit/generate next code or assign an unused preprinted code → save → QR/NFC `tagToken` remains stable unless the user explicitly regenerates the tag identity.

**15. Adding item attachments.** Item Detail → Attachments → upload Receipt, Manual, Warranty document, or Other file → attachment appears as a quiet row on Item Detail. No OCR or reminder flow is triggered in MVP.

**16. Exporting household data.** Settings → Data & Export → choose Inventory CSV, Photo Archive, Label PDF, or Full Household Export → export job starts → completion state provides download and a short data-portability explanation.

## 10. UX & Interaction Requirements

**Maximum taps** (pinned to numbers, not left as prose that can't be checked against):

| Flow | Target |
|---|---|
| Add item, AI-assisted, single item | ≤ 4 taps: camera → shutter → confirm reviewed form → save. Only holds with the last-used-destination default (§9 flow 2). |
| Add a batch of items to one Container | Entry (1 tap, from Container view) → capture → review list → Save All (1 tap) — independent of item count, since review is scan-and-fix, not N confirmations. No time target yet — needs real testing (§19). |
| Find an item | ≤ 2 taps after typing a query |
| Move an item | ≤ 3 taps |
| Open a Container via QR/NFC | 1 tap (or zero, for NFC — the OS handles tag reading) |

**10.2 Loading and confirmation:** skeleton screens, never spinners. A capture-confirmation motion appears immediately on save, decoupled from actual network completion, so backend latency (§21) never undercuts the "fast enough to become a habit" principle.

**10.3 Error states:** inline validation near the offending field; network failures surface as a retryable toast, never a full-screen block. AI recognition failure falls back to manual entry, never a dead end.

**10.4 Empty states:** every list view has its own designed empty state with a clear next action — see [§3](#3-design-language--experience-principles).

**10.5 AI-suggested field indication:** every AI-populated field is visually distinguishable from user-entered ones until saved — both a trust signal and the source of the AI-acceptance-rate metric (§5).

**10.6 Accessibility:** WCAG 2.1 AA baseline; minimum 44×44 CSS px tap targets (a neutral value, not an iOS-specific unit, since this is one shared codebase across platforms); OS-level font scaling supported; color contrast specifically verified on the AI-suggested-field highlighting pattern, since it's novel and not covered by generic guidance.

**10.7 Terminology consistency:** *Household, Location, Container, Item, Member* are canonical data-model terms. User-facing copy may say "bin" where it improves comprehension for physical storage (`Garage Bin 2`, `Print bin labels`, `Bin ID`), but implementation names should remain `Container` unless the field is explicitly a display-code/label concept. Avoid mixing "Box," "Bin," and "Container" randomly on the same screen.

## 11. Search Experience

Search is the product, not a feature of it — the whole premise is that finding something takes seconds. This section describes the experience Shohaz must deliver; **implementation lives in [§25](#25-search-implementation)**, deliberately kept separate so this isn't locked to one technical approach.

**The bar: it should feel like Spotlight**, not like filtering a spreadsheet. Concretely:
- **Instant, as-you-type results** — not a submit-and-wait interaction.
- **Typo-tolerant** — "scrwdriver" finds "screwdriver."
- **Spans everything, ranked sensibly**: item names, original detected names, curated/normalized names, aliases, categories, tags, notes, *and* container/location names (searching "garage" should surface every item in the Garage, not just locations literally named "garage").
- **Context-aware results** — a result doesn't just say "Phillips Screwdriver," it shows the breadcrumb (Garage → Toolbox → Drawer 2) inline, since the destination is as important as the match.
- **Filters as a refinement, not a separate mode** — Location/Category/Tag filters narrow an active search, they aren't a different screen.
- **Graceful degradation offline**: search still works offline against whatever's locally cached, clearly indicated as a reduced/best-effort result set — not presented as equivalent to the full server-side search.

This is a genuinely hard bar — client-side fuzzy matching over a partial, locally-cached dataset is not Spotlight-quality. Meeting it requires real server-side search (§25), which is one of the reasons the platform choice in [§20](#20-architecture-decision-record-application-platform--datastore) matters as much as it does.

## 12. AI Capture Experience

**Multi-item-per-photo detection is in MVP** — spread several items destined for one Container out, photograph them (one or more photos), and Shohaz detects and proposes each one individually, not just the single most prominent object.

**This is a deliberate, higher-ceiling bet, made with eyes open.** A simpler alternative exists — a fast single-item repeat-capture loop (shoot, confirm, camera reopens automatically, repeat) — and it would be lower-risk. Full multi-item detection is chosen instead because "one photo, everything in it recognized" is closer to the Apple-Photos/Google-Lens bar this product is chasing: a repeat-loop is still fundamentally "log items one at a time, faster," while true multi-item detection is a qualitatively different, more magical capability. §19 tracks the specific validation work needed before trusting it in production.

**Experience:**
- A photo can contain 1–20 items; the review experience adapts automatically (single-item form vs. a scannable, editable, removable list) rather than requiring the user to pick a "mode."
- Every detected item gets its own AI-cropped photo, extracted from the source image — no manual per-item photography needed.
- Nothing saves without being visible and editable first (§10.5) — for a batch, this means reviewing the *list*, not confirming each item individually one by one, which would defeat the feature's purpose.
- A fast contextual entry point exists from inside a Container's own view ("Add items here") that skips destination selection entirely, since it's already known — this is the primary path for "I'm organizing this bin right now."
- A capture session can span multiple photos before saving, if everything doesn't fit in one frame.

**Known, accepted risk:** detection quality on cluttered or overlapping items is genuinely unvalidated — this is not a solved capability being described after the fact, it's an ambitious bet being made deliberately. See [§19](#19-open-questions) and [§24](#24-ai-integration-details).

## 13. Collaboration & Household Sharing

**Simultaneous edits:** optimistic concurrency, not locking. If two members edit the same item near-simultaneously, the second save compares against the record's last-known-updated timestamp; on mismatch, surface "This was changed by [name] — review their version?" rather than silently overwriting. Real-time merge is explicitly not attempted in MVP.

**Deleted items and conflicts:** if one member is editing an item another member trashes, the editor sees a clear "this item was removed" state on their next save attempt, not a confusing silent failure.

**Ownership transfer:** an Owner-only action; enforced as a database-level invariant (exactly one Owner per household, always — §22) rather than just an application convention.

**Notifications:** MVP is in-app only — an activity feed (below) with an unseen-changes indicator. Push notifications are V2 (device permissions, tokens, and delivery infrastructure are real scope, not a checkbox).

**Edit history / activity feed:** the existing activity log is promoted from a background audit trail to a genuinely browsable feed — household-wide and per-item — not just data captured for potential future use.

**Undo:** a short-lived (proposed 10s) undo affordance after destructive-feeling actions (archive, trash, move) — a standard, low-risk pattern that meaningfully reduces the cost of AI-assisted mistakes and accidental taps.

**Conflict handling summary:** surfaced to the user, never silent — this is the one governing rule underneath all of the above.

## 14. Data Lifecycle: Archive, Trash & Deletion

- **Archive**: soft, deliberate, indefinite. "I don't have this anymore, but keep the record." Excluded from default search/browse, restorable any time, no retention limit. Applies to Items only.
- **Trash**: the outcome of any delete action, on Items, Containers, or Locations. Retained for **30 days**, restorable within that window, then automatically and permanently purged by a scheduled job. Active records cannot be permanently deleted directly. A deliberate **Delete Forever** action is available only from within Trash, uses the dedicated danger treatment, and requires an explicit confirmation dialog.
- **Deleting a Container or Location with contents**: contents move to Trash *together* with their parent — never orphaned, never silently cascaded without the same recoverability guarantee, never blocked pending manual cleanup.
- **Photos**: a trashed record's photo is retained (recoverability implies its photo must be too) and only actually removed from storage at the moment of permanent purge — tying photo cleanup to the same lifecycle event as the record itself, rather than the two drifting out of sync.

## 15. Migration & Interoperability

Shohaz is replacing a working system — Apple Shortcuts, Google Sheets, Google Apps Script, NFC tags, standardized item mappings, review queues, normalization rules — not launching into a greenfield world.

**CSV import (MVP):** a guided import — upload a CSV, map its columns to Shohaz fields (name, category, location, container, quantity, tags, notes at minimum), preview the result, confirm. Locations/Containers referenced in the import are created if they don't already exist. **Open, not yet decided: deduplication strategy** — does importing match existing Locations/Containers by name, or always create new ones? This needs your input on how the existing Sheets data is actually structured before it can be answered correctly rather than guessed (§19).

**Data export (MVP):** Settings includes a Data & Export screen with Inventory CSV, Photo Archive, Label PDF, and Full Household Export. This is a product trust feature, not just an admin convenience: household inventory is personal and long-lived, so users must be able to leave with their data. Exports should be asynchronous where needed and clearly indicate progress/completion.

**Existing NFC tags:** the household's current tags encode identifiers tied to the legacy Apps Script system, which Shohaz has no way to intercept. The realistic migration path is re-tagging (the same one-time "write a tag" action already required for new Containers, §8.4), not silent interoperability — this is a real limitation to plan for, not an implementation detail to gloss over.

**Existing Shortcuts:** rather than building and maintaining a permanent compatibility shim pointed at a fundamentally different backend, migration includes **updated Shortcuts templates** that call Shohaz's new API (§23) once a household has migrated. This is a scope decision, not an oversight — indefinite dual-system support isn't a reasonable ask of engineering relative to its value.

**Standardized item mappings / normalization rules:** if the existing system's rules can be exported in a structured form, they're a direct import target into Shohaz's `normalization_rules` table (§22) — this is genuinely valuable prior work worth preserving, not starting the learning process from zero. **Open: I don't know the existing rules' exact shape, so this needs a real data sample before the import mapping can be designed precisely (§19).**

## 16. Future Integrations & Extensibility

Home Assistant and Apple Shortcuts integration remain important long-term goals. Neither ships in MVP, but both are specified concretely enough here to be implementation-ready when their turn comes, not left as a vague aspiration.

**Requirements shared by any automation client:**
- **A stable, versioned API** (§23) — breaking changes require a new version, not a silent behavior change under clients that depend on it.
- **Automation-friendly authentication**: a household Owner generates a scoped, revocable API key from Settings, distinct from normal user sign-in — Shortcuts and Home Assistant authenticate with this, not a personal session token.
- **Webhooks (built later, modeled now)**: the event model this implies (`item.created`, `item.moved`, `container.created`, etc.) is named and structured consistently with the activity log (§13) from the start, so real webhook delivery can be added later without re-modeling events from scratch.
- **Idempotent, documented endpoints** — a hallmark of anything meant to be called by an automation rather than a human.

### 16.1 Home Assistant Integration (V2 build; specified now)

A native Home Assistant **custom component** — real entities and services, not a generic REST sensor a user has to hand-configure. Distributed via **HACS** (Home Assistant Community Store), the standard path for an integration before, if ever, it's proposed for HA core.

**Setup (Config Flow):** added through Home Assistant's normal "Add Integration" UI. The user pastes in a scoped API key generated from Shohaz Settings (§16, above); the integration validates it and confirms which household it's bound to. One Home Assistant instance maps to one Shohaz household — multi-household support is out of scope here, consistent with Shohaz itself being single-household-per-user in MVP (§6).

**Entities exposed:**
| Entity | Type | Notes |
|---|---|---|
| `sensor.shohaz_<location>_item_count` | Sensor, one per Location | Count of active Items in that Location (including its Containers) |
| `sensor.shohaz_total_items` | Sensor | Household-wide active item count |
| `sensor.shohaz_needs_review_count` | Sensor | Backs the Needs-Review Queue (§8.5, §29) — a natural automation trigger ("notify if this exceeds N") |
| `sensor.shohaz_trash_expiring_soon` | Sensor | Count of trashed items within 48h of permanent auto-purge (§14) — lets someone catch a mistaken deletion via a Home Assistant notification, not just by remembering to check the app |
| `sensor.shohaz_last_activity` | Sensor | Most recent activity-log entry (§13) as state, with actor/entity/action as attributes |

**Services exposed:**
| Service | Purpose |
|---|---|
| `shohaz.search_item` | Calls the same server-side search as §11/§25; returns matches (name, breadcrumb, confidence) as response data, usable in automations/scripts — e.g. piping the result into a text-to-speech announcement on a smart speaker |
| `shohaz.log_item` | A minimal text-based add (name, optional Location/Container, optional notes) for automation-triggered logging where no photo is available — deliberately not a substitute for AI-photo capture (§12), just a fallback automations can call |
| `shohaz.toggle_favorite` | Favorite/unfavorite an item by ID |

**Data flow:** polling via Home Assistant's standard `DataUpdateCoordinator` pattern (a lightweight `GET /api/v1/households/:id/summary` endpoint, added to §23, returns the counts above in one call rather than the integration reconstructing them from full item lists on every poll). Once Shohaz's own webhook delivery (above) is built, the integration can move from polling to push for near-real-time sensor updates — a planned second iteration, not a requirement of the first.

**Explicitly not in this integration's first version:** voice query via Home Assistant's Assist/conversation system, and Home Assistant's own NFC tag-scanning triggering a Shohaz lookup. Both are natural extensions of this same foundation and worth revisiting once the entity/service integration is live and actually being used — building them speculatively now would be designing ahead of real usage data.

## 17. Non-Functional Requirements

Kept product-level here; implementation specifics live in [§27](#27-security-implementation).

**Performance:** dashboard/search feel instant (§11); AI capture round-trip inside the (still-provisional) 15s single-item budget (§5).

**Security:** household data isolation is non-negotiable and enforced in depth, not by a single layer (§27) — application-level checks backed by database-level Row-Level Security.

**Reliability:** production-grade uptime is realistic on the chosen platform (§21); no enterprise SLA is being promised or needed at this scale.

**Privacy:** photos and locations of personal belongings are sensitive — the product will know where a passport and other valuables are kept. This elevates access control from a checkbox to a specifically-reviewed requirement, and implies a real privacy policy is needed before any public launch (§19, still not drafted).

**Accessibility:** see [§10.6](#106-accessibility).

## 18. Roadmap

- Semantic/embedding-based search, layered onto the search foundation in §11/§25
- AI duplicate detection (needs a similarity definition + merge UX first)
- AI-generated container/summary descriptions
- Multiple photos per item
- Multiple households per user
- Full offline-first multi-user write-conflict *resolution* (beyond the MVP's conflict *surfacing*, §13)
- Push notifications
- The Home Assistant custom component (§16.1) and full Apple Shortcuts integration, built on the API foundation in §16
- Home Assistant voice query (Assist) and NFC-tag-scan-triggered lookups (§16.1) — deliberately sequenced after the entity/service integration is live, not built alongside it
- Barcode scanning, receipt OCR, warranty/maintenance reminders, shopping list integration, smart reminders
- Apple Vision Pro

## 19. Open Questions

Each item below names what's actually blocking it, not just that it's unresolved:

- Product's exact numeric time/tap targets for both single-item and batch capture (§5, §10) — need real latency testing, not estimates, before being committed.
- **Batch capture detection quality is completely unvalidated** — this is the single biggest product risk carried into MVP, and needs a real test against cluttered/overlapping real-world photos before shipping, not after.
- CSV import deduplication strategy (§15) — needs to know the actual shape of the existing Sheets data.
- Normalization rules import mapping (§15) — same dependency.
- What happens when a Location/Container's Trash-restore target no longer exists (§9 flow 11) — needs a defined fallback (prompt for a new destination is the working assumption, not yet confirmed).
- Privacy policy — not yet drafted, needed before public launch.
- Home Assistant entity/sensor naming conventions (§16.1) beyond the illustrative examples given — needs to follow HA's actual naming/unique-ID conventions precisely, which is a implementation-time lookup against current HA developer docs, not a PRD-level decision.
- Polling interval for the Home Assistant integration's `DataUpdateCoordinator` (§16.1) — not yet chosen; too frequent burns API quota for little benefit, too infrequent makes the sensors feel stale.
- Product's exact desktop information-density decisions (§8.6, §3) — direction is set, specifics are a Figma exercise, not a PRD exercise.
- Bin nesting depth (§8.4) — product direction currently supports recursive Containers, but implementation should confirm whether the UI allows unlimited depth or sets a practical display limit before collapsing into breadcrumbs/search.
- Bin naming convention — Figma now favors short display names such as "Garage Bin 2" with breadcrumbs for context. Confirm whether concatenated names like "Garage Storage Bin 2" should ever appear in list/card contexts.
- Search/filtering — Search supports filter chips by requirement (§11), but the current dashboard does not expose filter chips by default. Confirm whether filters belong only in active Search Results or also on Dashboard.
- Figma componentization is improved but not a code library: the desktop sidebar/nav rail has been componentized and v2 screens were reorganized into a numbered user journey, but engineering should still build its own typed component library (§28) rather than trying to import Figma components directly.

---

# PART 2: TECHNICAL DESIGN APPENDIX

*Everything below is the how, in support of Part 1's what and why. This part is expected to change faster and more often than Part 1 as implementation proceeds — that's fine, that's what it's for.*

## 20. Architecture Decision Record: Application Platform & Datastore

**Status:** Accepted.

**Context:** Shohaz needs genuine Spotlight-quality search across a relational hierarchy (households, locations, recursively-nested containers, items, tags, normalization rules), real defense-in-depth on household data isolation, and a first-class desktop management experience alongside mobile capture. Two platform directions were evaluated against these requirements.

**Options considered:**

| | Firebase (Cloud Functions, Firestore, Cloud Storage, Firebase Auth, Firebase Hosting) | Next.js + Supabase (Postgres) + Vercel |
|---|---|---|
| Search | No native full-text/fuzzy search — requires a client-side cache-and-fuzzy-match workaround | Native full-text search + `pg_trgm` fuzzy matching, server-side, across all entities in one ranked query |
| Data model fit | Document model fights recursive containers (manual cycle-checking), tags (forced into denormalized strings, no real joins), normalization rules (awkward without joins) | Real foreign keys, real many-to-many (tags), recursive CTEs for the container hierarchy — a natural fit for this domain |
| Security | The client never needs to touch Firestore directly, so Security Rules provide no real second enforcement layer beyond the API | Row-Level Security is genuinely usable as a second, database-enforced layer alongside the API |
| Desktop-grade app | PWA on Firebase Hosting | Next.js on Vercel — the standard, well-supported way to build a real desktop web app |
| Mobile offline/realtime | Best-in-class, largely batteries-included | Solid, more manual to assemble |
| Cost at this scale | Generous free tier | Also has a workable free tier |
| Ops | No server to manage | Also low-ops via Vercel + Supabase, slightly more schema/migration ownership |

**Decision:** Next.js + Supabase (Postgres) + Vercel. The search requirement is close to unsolvable elegantly on Firestore; combined with the relational data model and the desktop requirement, Postgres/Supabase fits what this product needs. Mobile offline/realtime is a real, acknowledged tradeoff — see [§26](#26-offline--sync-implementation) for how it's handled without a batteries-included mobile offline SDK.

**Consequence:** all technical sections below assume this stack. Revisiting this decision means re-deriving Part 2, not patching it.

## 21. System Architecture

- **Frontend:** Next.js (App Router), deployed on Vercel. Mobile experience is a fully installable PWA (service worker, offline shell) built on the same Next.js codebase — not a separate app.
- **UI/design system:** Tailwind CSS + shadcn/ui (built on Radix primitives). Components are copied into the codebase and owned, not pulled in as a locked third-party theme — deliberately, since §3's "premium, not off-the-shelf" design ambition depends on the default shadcn look being customized rather than shipped as-is. Radix's accessibility primitives back the WCAG 2.1 AA baseline in §10.6 for free on interactive components (dialogs, menus, etc.).
- **Backend:** Next.js API routes / Server Actions for application logic; Supabase Edge Functions for anything needing to run closer to the database or independent of a request from the Next.js app (e.g. the scheduled Trash-purge job, §14).
- **Database:** Supabase-managed Postgres. Row-Level Security enabled on every household-scoped table (§27) as a real second authorization layer, in addition to application-level checks.
- **Auth:** Supabase Auth (Google OAuth + email/password).
- **File storage:** Supabase Storage, with signed URLs for private photo access, content-type/size validated on upload (image/* only, proposed 10MB cap).
- **AI provider:** abstracted behind a Vision Provider interface (§24) — Gemini is the current implementation choice, not a hardcoded dependency.

## 22. Data Model / Database Schema

Postgres, household-scoped via foreign keys and enforced via Row-Level Security (§27), not via document-path structure.

```sql
households (id, name, created_at)

household_members (household_id, user_id, role, joined_at)
  -- PK (household_id, user_id)
  -- role: 'owner' | 'member'
  -- CONSTRAINT: a partial unique index on (household_id) WHERE role = 'owner'
  --   enforces "exactly one Owner" as a database-level invariant, not just an
  --   application-level convention.

invites (id, household_id, invited_email, invited_by_user_id, status, created_at, expires_at)

users (id, email, display_name, avatar_url, created_at)  -- id = Supabase auth uid

locations (id, household_id, name, description, cover_photo_id, created_by_user_id, created_at)

containers (
  id, household_id, location_id, parent_container_id,  -- self-referential, nullable
  name, description,
  tag_token UNIQUE,  -- opaque stable token backing both QR and NFC, §8.4
  display_code,  -- human-readable household code, e.g. GAR-234; UNIQUE(household_id, display_code)
  cover_photo_id, created_by_user_id, created_at
)
  -- Cycle prevention (A contains B contains A) enforced via a BEFORE INSERT/UPDATE
  -- trigger using a recursive CTE — a database-level invariant now, not just an
  -- API-layer discipline that every engineer has to remember to implement.

items (
  id, household_id, location_id, container_id,  -- exactly one non-null, CHECK constraint
  name, original_detected_name, category, quantity,  -- 0-9999, CHECK constraint
  notes, primary_photo_id, status,  -- 'active' | 'archived' | 'trashed'
  needs_review,  -- boolean, §8.5
  created_by_user_id, created_at, updated_at,
  trashed_at, permanently_delete_after  -- §14
)

tags (id, household_id, name, UNIQUE(household_id, name))
item_tags (item_id, tag_id)  -- real many-to-many join table

attachments (
  id, household_id, item_id,
  kind,  -- 'receipt' | 'manual' | 'warranty' | 'other'
  file_name, storage_path, content_type, size_bytes,
  created_by_user_id, created_at
)

item_extra_details (
  id, household_id, item_id,
  field_key, field_label, value,
  source,  -- 'category_template' | 'manual'
  created_at, updated_at,
  UNIQUE(item_id, field_key)
)

label_batches (
  id, household_id, created_by_user_id,
  status,  -- 'draft' | 'generated' | 'printed'
  paper_preset, start_offset,
  include_qr, include_display_code, include_name, include_location,
  created_at, updated_at
)

label_batch_entries (
  id, household_id, label_batch_id,
  container_id,  -- nullable when creating unassigned/preprinted labels
  display_code, tag_token,
  status,  -- 'unassigned' | 'assigned' | 'printed'
  position_index
)

normalization_rules (
  id, household_id, raw_pattern, canonical_name, category,
  source,  -- 'learned' | 'manual'
  usage_count, created_at, updated_at
)
  -- Lookup: exact/case-insensitive match in MVP; trigram similarity (pg_trgm,
  -- the same extension powering search, §25) as a V2 refinement for near-miss
  -- matching ("phillips" vs "philips").

photos (id, household_id, owner_entity_type, owner_entity_id, storage_path, thumbnail_path, created_by_user_id, created_at)

activity_log (id, household_id, actor_user_id, entity_type, entity_id, action, changed_fields JSONB, created_at)
  -- changed_fields stores only what changed, not full before/after snapshots.

favorites (user_id, item_id, created_at)  -- PK (user_id, item_id)
```

**Cross-household reference validation** (a blanket rule, stated once): every write validates that *all* foreign-key references — not just the primary entity — resolve to the same `household_id` as the caller's household. This is enforced both at the API layer and by RLS itself (§27), genuine defense-in-depth.

## 23. API Specification

Implemented as Next.js API routes (REST-shaped: `/api/v1/locations`, `/api/v1/containers/:id`, etc.) rather than the earlier action-based JSON-RPC envelope — Postgres/Supabase's tooling and Next.js's routing both assume conventional REST, and there's no platform constraint pushing toward an action-based shape the way Apps Script's lack of routing did.

**Versioning:** all endpoints under `/api/v1/` — a breaking change requires a new version, in support of the integration-readiness goal (§16).

**Auth:** Supabase Auth session (user-facing) or a scoped API key (automation clients, §16), both verified on every request; RLS provides a second layer independent of the API code (§27).

**Error shape:** standard HTTP status codes (401/403/404/409/422/429/500) plus a JSON body `{ error: { code, message } }` for machine-readable detail beyond the status code.

**Pagination:** cursor-based on every list endpoint, default page size 50, max 100.

**Key endpoints** (illustrative, not exhaustive):
- `POST /api/v1/households`, `POST /api/v1/households/:id/invites`, `POST /api/v1/invites/:id/accept` (email-bound, §9 flow 9), `POST /api/v1/households/:id/transfer-ownership`
- `GET/POST/PATCH/DELETE /api/v1/locations`, `.../containers` (with move as a distinct `PATCH` on `location_id`/`parent_container_id`, not conflated with a rename)
- `GET /api/v1/containers/by-tag/:tagToken` — resolves both QR and NFC (§8.4)
- `POST /api/v1/containers/:id/display-code/generate`, `PATCH /api/v1/containers/:id/display-code`, `POST /api/v1/containers/:id/assign-label-code` — display-code management and assigning preprinted labels (§8.4)
- `GET /api/v1/search?q=...` — the server-side search endpoint backing §11; see §25 for what it actually runs
- `POST /api/v1/items/recognize` — single or batch (§12); returns detected item(s), does not create records
- `POST /api/v1/items` / `POST /api/v1/items/batch` — the save step, separate from recognition, in one Postgres transaction for batches (atomic — all items are created or none are)
- `GET/POST/DELETE /api/v1/items/:id/attachments`, `GET/PATCH /api/v1/items/:id/extra-details` — secondary item metadata (§8.5)
- `POST /api/v1/items/:id/trash`, `POST /api/v1/items/:id/restore` (§14)
- `GET /api/v1/activity`, `GET/POST /api/v1/favorites`, `GET /api/v1/tags`
- `GET/POST /api/v1/label-batches`, `GET /api/v1/label-batches/:id/pdf` — batch label preview/PDF generation and unassigned-label flows (§8.4)
- `POST /api/v1/exports` and `GET /api/v1/exports/:id` — asynchronous inventory CSV, photo archive, label PDF, and full household export (§15)
- `GET /api/v1/households/:id/summary` — item counts by Location, needs-review count, trash-expiring-soon count, most recent activity entry, in one lightweight call. Added to support the Home Assistant integration's polling (§16.1) without it having to reconstruct these from full list endpoints on every poll — also reusable by the Dashboard (§29) if useful there.

## 24. AI Integration Details

**Provider abstraction (per the product requirement in §12/§17):** a `VisionProvider` interface — `detectItems(photo) → DetectedItem[]` — implemented once for Gemini, swappable without touching any call site. Requirements on any implementation: structured/schema-validated output (not parsed free text), a defined latency budget (target: p90 under the 15s single-item add budget, §5, leaving headroom for the rest of the capture flow), and a defined cost ceiling per household per month (a number to set deliberately, not an accident of whichever free tier is currently available).

**Current implementation: Gemini 2.5 Flash-Lite**, via structured-output/JSON mode with an explicit schema: `{ items: [{ suggestedName, category, suggestedTags, confidence, boundingBox }] }`, 1–20 items per call.

**Cost management (an implementation detail, not a product requirement — moved here per §1's restructuring):** Gemini's free tier is generously sized for this product's realistic scale. If a hard cost ceiling is wanted regardless of provider pricing changes, the practical technique is isolating the API key under its own billing-free Google Cloud project, separate from any other project that has billing enabled for unrelated reasons — free-tier eligibility is tied to the key's project, not to the caller. This is an operational safeguard, not something product requirements should be built around.

**Failure modes:** provider error/timeout, quota exhaustion, and schema-validation failure (a 200 response that doesn't parse into the expected shape — a real, common failure mode with LLM output, distinct from a network error) all fall back to manual entry, never a dead end.

**Confidence caveat:** LLM self-reported confidence scores are known to correlate imperfectly with actual accuracy, calibration attempts included. Validate against real labeled photos before fully trusting the confidence-gated blank-vs-prefilled UX (§10.5) in production.

## 25. Search Implementation

Backing the experience described in §11:

- A generated `tsvector` column on `items` combining `name`, `original_detected_name`, `category`, tag names (via a join/aggregate), and notes, indexed with a GIN index for full-text search.
- `pg_trgm` trigram indexes on the same searchable text for typo tolerance, blended with full-text ranking (`ts_rank`) rather than relying on one technique alone.
- Container/Location names included via a join so a query like "garage" surfaces every item whose breadcrumb includes a matching Location, not just Locations literally named that.
- Runs as a single ranked SQL query (or Postgres RPC function) called from `/api/v1/search`, server-side — no client-side dataset sync required for search correctness.
- **Offline fallback**: a reduced local cache (IndexedDB) of recently-viewed/synced items, searched client-side with a lightweight library only when there's no network — explicitly a degraded experience, visually indicated as such, not presented as equivalent to the online path.

## 26. Offline & Sync Implementation

Offline behavior is defined once here, consistently:

- **Local persistence:** a bounded IndexedDB cache of the current household's recently-viewed data (not a full dataset mirror) — sized for "browse what you've already seen while offline," not "the whole inventory always available offline."
- **Syncing:** on reconnect, cached writes queue and retry in the foreground (app open/visibility-change triggered) — not via the Background Sync API, which iOS Safari doesn't support, so this cannot be a true background guarantee on that platform, and the UX should not imply one.
- **Pending state:** any locally-queued, not-yet-confirmed write shows a persistent "pending sync" indicator on the affected item until the server confirms it.
- **Conflicts:** handled per §13 — optimistic concurrency, surfaced to the user, not silently merged or overwritten.
- **Stale cache / refresh strategy:** cached data is treated as provisional and re-validated against the server on next connection; the UI distinguishes "definitely current" from "may be stale, offline" rather than presenting cached data with unearned confidence.

## 27. Security Implementation

- **Row-Level Security** enabled on every household-scoped table, policies checking the authenticated user's membership (and role, for Owner-only operations) — a real second enforcement layer, independent of and in addition to API route code.
- **Cross-household reference validation** enforced both in API route logic and, now, by RLS itself.
- Signed URLs for private photo access; content-type/size validation on upload.
- Invite acceptance is email-bound (§9 flow 9), not a bearer token.
- Default rate limit: 60 write requests/minute per authenticated user — basic abuse prevention, not a tuned policy.
- Scoped, revocable API keys for automation clients (§16), distinct from user session auth.

## 28. Component Library

Built on the Tailwind + shadcn/ui foundation in §21 — table/dialog/form/toast primitives come from shadcn and are restyled per §3; the entries below are the product-specific compositions on top of that foundation, not a from-scratch component set.

| Component | Purpose |
|---|---|
| `SearchBar` | Persistent, auto-focused, debounced, calling the server search endpoint (§11, §25) |
| `CaptureButton` | Primary capture CTA, always reachable |
| `ItemCard` | Photo-forward; thumbnail + name + breadcrumb |
| `ContainerCard` / `LocationCard` | Thumbnail + name + count |
| `AIReviewForm` | Single-item post-capture review; AI-sourced fields visually distinct (§10.5) |
| `BulkReviewList` | The batch counterpart — a scannable, editable, removable list, not `AIReviewForm` repeated N times; needs its own dedicated design pass |
| `PhotoUploader` | Capture/upload + offline-pending state |
| `TagScannerView` | QR camera scan; NFC needs no equivalent component, handled by the OS |
| `TagLabelView` | Single Container label preview with QR, display code, optional name/location (§8.4) |
| `LabelPrintManager` | Desktop batch label printing: selection, paper preset, print offset, content toggles, preview grid, PDF export (§8.4) |
| `BinDisplayCodeManager` | View/copy/edit/generate/assign human-readable Container display codes like `GAR-234` (§8.4) |
| `BinIdBadge` | Flat, shadowless display-code chip; category-tinted, never competing with status badges |
| `InlineStatusIndicator` | Quiet dot + muted label for item/container status; replaces competing filled status badges on cards |
| `Breadcrumb` | Tappable Location → Container → sub-container path, disambiguating name collisions (§8.3) |
| `DesktopSidebar` | Persistent Location/Container tree — desktop-only, §8.6 |
| `NestedLocationsBrowser` | Expandable Location → Container → sub-Container browser; supports recursive Containers without making the mobile UI feel like a tree table |
| `BulkActionToolbar` | Multi-select operations — desktop-only, §8.6 |
| `ActivityFeedRow` | Per-item and household-wide activity (§13) |
| `AttachmentsSection` | Quiet Item Detail section for receipt/manual/warranty/other files (§8.5) |
| `ExtraDetailsSection` | Category-scoped optional fields; not a generic custom-field builder (§8.5) |
| `TagsBrowser` | Lightweight tag browsing with item counts; desktop/sidebar plus Settings access (§8.6) |
| `DataExportPanel` | Settings export surface for CSV, photo archive, label PDF, and full household export (§15) |
| `EmptyState` | Reusable, illustrated, per §3/§10.4 |
| `ConfirmDialog` | Destructive/Owner-only action confirmations |
| `Toast` | Retryable errors, undo affordances (§13) |

## 29. Screen Inventory & Design Briefs

Each screen below states its platform, the states it needs to be designed for (not just its "happy path"), its primary content and actions, and where it sits in navigation — enough for a Figma designer to start storyboarding without re-deriving intent from the functional requirements in §8–§14. Visual treatment itself (layout, spacing, exact component composition) is a Figma decision, per §3.

### Sign-In
- **Platform:** mobile + desktop (responsive)
- **States:** default, authenticating, error (auth failed)
- **Primary content:** Shohaz branding, sign-in options (Google, email/password)
- **Primary actions:** Sign in with Google; sign in with email/password
- **Navigation:** entry — cold start, no session. Exit → Household Setup (no household yet) or Dashboard (existing household).

### Household Setup
- **Platform:** mobile + desktop
- **States:** default (create-or-join choice), creating, joining via a pre-filled invite link, error (invalid/expired invite)
- **Primary content:** "Create a household" / "I have an invite" — two clear paths, nothing else competing for attention
- **Primary actions:** Create household (name input); redeem invite (verifies signed-in email matches the invite, §9 flow 9)
- **Navigation:** entry — post-sign-in with no household membership. Exit → Dashboard, empty state.

### Dashboard
- **Platform:** mobile-primary; present on desktop but secondary to desktop's management-oriented screens (§8.6)
- **States:** empty (< 5 items, onboarding prompt replaces "recent items," §8.1), populated, loading (skeleton), offline (cached data shown with a sync indicator)
- **Primary content:** search bar (focused by default, §2 search-first), floating camera button, recently-added items (household-wide), quick links to Favorites and Locations
- **Primary actions:** search; capture; open a recent item; open Favorites/Locations
- **Navigation:** entry — app open, post-auth, household exists. This is the hub screen; nearly everything else is reachable from it.

### Search Results
- **Platform:** mobile + desktop (desktop may show a denser result grid, §8.6)
- **States:** results populated (ranked, server-side, §11), zero-results (fuzzy suggestions offered, not a dead end), typing/loading (progressive, not submit-and-wait), offline-degraded (explicitly indicated as a reduced, locally-cached result set, §25)
- **Primary content:** result cards — photo, name, full breadcrumb inline, quantity; Location/Category/Tag filter chips refining the active search, not a separate mode
- **Primary actions:** open a result; apply/remove a filter
- **Navigation:** entry — typing in the Dashboard search bar. Exit → Item Detail.

### Item Detail
- **Platform:** mobile + desktop
- **States:** active (default), archived (visually distinguished, Restore available), trashed (reached via Trash — Restore / Delete Forever available, §14), needs-review badge shown when applicable (§8.5)
- **Primary content:** primary photo, name, breadcrumb, category, tags, notes, quantity, quiet Attachments section, category-scoped Extra Details, per-item activity history, favorite toggle
- **Primary actions:** Edit; Move; Archive; Trash; favorite/unfavorite; add/remove attachment; open activity history
- **Navigation:** entry — Search Results, any item list, Activity Feed, Favorites. Exit → Item Edit, Move sheet, Container Detail (via breadcrumb tap).

### Item Edit
- **Platform:** mobile + desktop
- **States:** pre-filled form, saving, validation error
- **Primary content:** editable name, category (fixed-list picker, §22), tags (add/remove), notes, quantity. Photo is view-only in MVP — no replace/multi-photo flow exists yet (§6).
- **Primary actions:** Save; Cancel
- **Navigation:** entry — Item Detail "Edit." Exit → back to Item Detail.

### Camera Capture
- **Platform:** mobile only — desktop's primary add-item path is Manual Add Item, not camera capture (§8.6)
- **States:** live viewfinder, permission-denied (routes to Manual Add Item, never a dead end, §12), captured-photo preview (retake/continue), batch session in progress (photo count, "add another photo" vs. "review & save," §12)
- **Primary content:** viewfinder, shutter, secondary gallery-picker option, session state indicator when in a multi-photo batch
- **Primary actions:** capture; retake; add another photo (batch); proceed to review; exit to Dashboard
- **Navigation:** entry — Dashboard camera button, or a Container's "Add items here" (destination pre-set, skips the picker, §12). Exit → AI Review or Bulk AI Review, based on detection count, not a user choice (§12).

### AI Review (single item)
- **Platform:** mobile
- **States:** fields pre-filled and marked AI-suggested (§10.5); low-confidence fields shown blank with a "couldn't identify this" prompt instead of a plausible wrong guess (§24); saving; save failed (retry, never silently lost)
- **Primary content:** the captured/cropped photo, name, category, tags, Location/Container (defaults to last-used or pre-set from a Container entry, §9 flow 2), an optional "remember this?" prompt when the user edits the name (§8.5 normalization)
- **Primary actions:** edit any field; Save; discard and retake
- **Navigation:** entry — Camera Capture, exactly one item detected. Exit → Item Detail (new item) or Dashboard.

### Bulk AI Review
- **Platform:** mobile
- **States:** list populated with every detected item pre-included; a row being edited; a row removed (struck through, excluded from the save); needs-review items visually flagged; saving; a genuinely new failure mode worth designing for — partial-batch save failure (§23's atomic write means this should be rare, but "saving..." → error needs a clear retry state)
- **Primary content:** the shared destination Container (shown once, editable per item as an override, §19); a scannable list of detected items, each with its own AI-cropped thumbnail, name, category, tags; an "add another photo" option; a Save All action showing the current count
- **Primary actions:** edit a row inline; remove a row; add a manual item into the same batch; add another photo; Save All
- **Navigation:** entry — Camera Capture, 2+ items detected. Exit → Container Detail (the shared destination, now populated) or Dashboard.

### Manual Add Item
- **Platform:** mobile + desktop — and desktop's *primary* way to add an item, since desktop doesn't do camera capture (worth designing this screen with that in mind, not just as a fallback afterthought)
- **States:** default form, saving, validation error
- **Primary content:** name, category, Location/Container, tags, notes, quantity — no AI-suggested styling anywhere on this screen, nothing here is AI-sourced
- **Primary actions:** Save; Cancel
- **Navigation:** entry — Camera Capture permission denied, an explicit "enter manually" choice, or (on desktop) the primary add-item entry point. Exit → Item Detail.

### Locations List
- **Platform:** mobile + desktop (desktop also has a persistent sidebar tree covering this, §8.6 `DesktopSidebar` — the two should feel like the same data, not two different features)
- **States:** populated, empty (onboarding prompt)
- **Primary content:** Location cards — photo, name, container/item count
- **Primary actions:** open a Location; add a Location
- **Navigation:** entry — Dashboard quick link, bottom nav. Exit → Location Detail, Create Location sheet.

### Location Detail
- **Platform:** mobile + desktop (desktop: denser list/table option, multi-select, §8.6)
- **States:** populated, empty (no Containers/Items yet)
- **Primary content:** name/photo/description, nested Container list, direct Item list
- **Primary actions:** Add Container; Edit; Delete (→ Confirm Trash dialog); open a Container or Item
- **Navigation:** entry — Locations List. Exit → Container Detail, Item Detail, Edit Location sheet.

### Container Detail
- **Platform:** mobile + desktop (desktop: denser view, bulk actions, batch label printing, §8.6)
- **States:** populated, empty (just-created, should prompt "Add items here" prominently rather than showing a generic empty state)
- **Primary content:** name/photo, breadcrumb, display code (`GAR-234`), QR-label/NFC-tagged status, nested sub-Container list, Item list
- **Primary actions:** **"Add items here"** (the fast entry point into Camera Capture with destination pre-set, §12 — this should be the most prominent action on the screen, it's the reason the contextual entry point exists at all); Move; Edit; Delete; view/print QR label; manage display code; open a sub-Container or Item
- **Navigation:** entry — Location Detail, breadcrumb taps, a QR scan or NFC tap (§9 flow 8). Exit → Camera Capture, Item Detail, sub-Container Detail, Tag Label view.

### Print Labels
- **Platform:** desktop-primary; mobile can view/share a single label but does not need the batch-print management UI.
- **States:** no Containers selected, selected Containers, unassigned-label creation, preview ready, PDF generating, PDF ready, generation error.
- **Primary content:** Container selection list, paper preset, start/print offset, content toggles (QR only / QR + display code / QR + display code + name; optional location), live label preview grid.
- **Primary actions:** select Containers; create unassigned labels; adjust print settings; generate/export PDF; print.
- **Navigation:** entry — Settings, Container Detail, desktop sidebar bulk actions. Exit → generated PDF/download, or back to Container Detail/Settings.

### Bin Display Code Management
- **Platform:** mobile + desktop
- **States:** current code, editing custom code, generating next code, assigning unassigned/preprinted code, validation conflict.
- **Primary content:** current display code, plain explanation that QR/NFC resolves to the same Container even if moved, recent/unassigned code list when assigning a preprinted label.
- **Primary actions:** copy code; edit; generate next code; assign unassigned code; save/cancel.
- **Navigation:** entry — Container Detail or Print Labels. Exit → Container Detail.

### QR Scanner
- **Platform:** mobile
- **States:** scanning, permission-denied (routes back to Container search/manual lookup, never a dead end), tag resolved, tag not found/error
- **Primary content:** QR camera scan frame, concise instructions, resolved Container preview when a stable tag identifier is recognized. NFC has no equivalent screen because the OS handles the tag read and deep-links directly to Container Detail (§8.4).
- **Primary actions:** scan; open resolved Container; cancel; retry on failed scan
- **Navigation:** entry — Settings/Container tools or any "scan label" affordance. Exit → Container Detail via `GET /api/v1/containers/by-tag/:tagToken` (§23), or back to the previous screen.

### Trash
- **Platform:** desktop-primary; reachable on mobile via Settings (§9 flow 11)
- **States:** populated (grouped by type and/or time-trashed), empty, an item selected (reveals Restore / Delete Forever)
- **Primary content:** trashed entities — thumbnail, name, type, days remaining before automatic purge (30-day window, §14)
- **Primary actions:** Restore (individual, or bulk on desktop); Delete Forever (the *only* path to permanent deletion in the product, confirmed via dialog); filter by entity type
- **Navigation:** entry — Settings (mobile) or sidebar (desktop). Restoring returns an item to its original context, or prompts for a new destination if that context no longer exists (§19, still open).

### Needs-Review Queue
- **Platform:** desktop-primary — triaging a backlog is a keyboard-and-wide-screen task, not a phone task (§8.6)
- **States:** populated, **empty — worth designing deliberately as a small moment of delight (§3), not just a generic empty state, since reaching zero is a real accomplishment**, a row being corrected
- **Primary content:** flagged items (§8.5) — thumbnail, original detected name, current name, category, inline correction fields
- **Primary actions:** correct name/category (triggers the "remember this?" normalization prompt); dismiss without changes; bulk-select
- **Navigation:** entry — desktop sidebar, or a badge/count surfaced from Settings. Exit → correcting a row can either keep it in the queue or resolve it, depending on the correction.

### Import
- **Platform:** desktop-primary — file upload and column mapping are not mobile-shaped tasks (§15)
- **States:** upload, column-mapping, preview, importing (progress), complete (created-record summary + a list of anything needing manual attention)
- **Primary content:** file drop zone; a mapping UI from the existing CSV's columns to Shohaz's fields; a preview table before committing
- **Primary actions:** upload; map columns; confirm import; review flagged rows post-import
- **Navigation:** entry — Settings → Import. Exit → completion summary, then Locations List or the Needs-Review Queue for anything flagged.

### Tags Browser
- **Platform:** desktop-primary, reachable from Settings on mobile.
- **States:** populated, empty, selected tag.
- **Primary content:** tag list with item counts; selected tag shows photo-forward item results.
- **Primary actions:** open a tag; open an item; rename/delete tag if permitted.
- **Navigation:** entry — desktop sidebar or Settings. Exit → Item Detail/Search Results.

### Data & Export
- **Platform:** desktop-primary, available in Settings on mobile.
- **States:** default, export queued, export in progress, export complete, export failed.
- **Primary content:** trust/data-portability copy; export options for Inventory CSV, Photo Archive, Label PDF, Full Household Export.
- **Primary actions:** start export; download completed export; retry failed export.
- **Navigation:** entry — Settings. Exit → download or Settings.

### Favorites
- **Platform:** mobile + desktop
- **States:** populated, empty
- **Primary content:** favorited items, photo-forward (§3 visual-first) — a grid, not a text list
- **Primary actions:** open an item; unfavorite
- **Navigation:** entry — Dashboard quick link, bottom nav. Exit → Item Detail.

### Settings
- **Platform:** mobile + desktop
- **States:** default
- **Primary content:** account info and sign-out, household name, links to Household Members, Trash (mobile), Import (desktop), Print Labels, Tags, Data & Export, normalization rules, in-app notification preferences (§13 — push is not in scope, so there's nothing to configure there yet)
- **Primary actions:** navigate to each sub-screen; sign out
- **Navigation:** entry — bottom nav / desktop sidebar.

### Household Members
- **Platform:** mobile + desktop
- **States:** populated (members + roles), inviting (email input, sending), invite pending (shown distinctly from active members)
- **Primary content:** member list — avatar, name/email, role badge; pending invites
- **Primary actions:** Invite (Owner only); Remove member (Owner only, confirm dialog); Transfer Ownership (confirm dialog, §13); Leave Household (Member; blocked with a prompt to transfer first if the caller is the sole Owner, §8.9)
- **Navigation:** entry — Settings.

### Activity Feed
- **Platform:** mobile + desktop
- **States:** populated (grouped by day), empty, unseen-activity indicator
- **Primary content:** chronological actions — actor, action type, entity, timestamp; a per-item scoped version of this same feed also appears inside Item Detail
- **Primary actions:** open the referenced entity; filter by entity type or actor
- **Navigation:** entry — Settings/bottom nav, or from within Item Detail (scoped). Exit → the relevant Item/Container/Location Detail.

### Modals, sheets, and dialogs

Lighter-weight than full screens, but each still has a clear single purpose and shouldn't be treated as an afterthought in Figma:

- **Create/Edit Location, Create/Edit Container** (sheet) — name, description, optional cover photo; nothing else.
- **Move Item/Container** (sheet) — a destination picker, scoped to the same household (§22), defaulting to a sensible recent/current context rather than opening on an empty picker.
- **CSV column mapping** (sheet, part of Import) — see Import above.
- **Attachment upload** (sheet or inline drawer) — choose kind (Receipt, Manual, Warranty, Other), upload file, save; no OCR/reminder configuration in MVP.
- **Extra detail edit** (sheet or inline row editor) — edit only the category-relevant fields surfaced by `ExtraDetailsSection`.
- **Assign unassigned label code** (sheet) — choose an unused preprinted display code and bind it to the current Container.
- **Confirm Trash** (dialog) — states clearly that this is recoverable for 30 days, so it doesn't read as scary as "Delete."
- **Confirm Permanent Delete** (dialog, reachable only from within Trash) — should read as meaningfully more serious than Confirm Trash, since it's the one truly irreversible action in the product.
- **Confirm Remove Member, Confirm Leave Household, Confirm Ownership Transfer** (dialogs) — Owner-only or role-changing actions; all should state the consequence plainly (e.g. removing a member revokes their access immediately) rather than a generic "are you sure."

## 30. Glossary

*Household* (the shared inventory + its members) · *Location* (top-level physical area) · *Container* (nestable grouping; often called a bin in user-facing copy where natural) · *Display Code* (human-readable Container code such as `GAR-234`) · *Tag Token* (opaque QR/NFC identifier) · *Unassigned Label* (preprinted code not yet bound to a Container) · *Item* (an individual belonging) · *Attachment* (secondary file attached to an Item) · *Extra Detail* (category-scoped optional field) · *Owner* / *Member* (roles) · *Archive* (soft, indefinite, "don't have it anymore") · *Trash* (soft, 30-day, "deleting this") · *Original Detected Name* (raw AI output, immutable) · *Normalization Rule* (a learned or manual mapping from a detected name to a canonical one) · *Needs Review* (a flag, not a blocking state) · *Favorite* (per-user) · *Activity Log* (audit trail, also the browsable activity feed).
