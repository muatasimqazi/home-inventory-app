# Shohaz v2 Upgrade Checklist

Tracks progress against the v2 upgrade instructions (updated PRD). Updated as work lands — check items off in the same commit/session that finishes them.

## 1. Design System Update
- [x] Retheme tokens to v2 taupe/neutral palette (`globals.css`)
- [x] Primary buttons solid brand-500 / white text
- [x] Secondary buttons quiet-neutral instead of solid ink
- [x] Category colors as muted dots/rails only (no large fills)
- [x] Bin ID badges flat, no shadow
- [x] Scan FAB (rounded taupe, white icon) in mobile bottom nav
- [x] Needs-review status indicator as inline dot + muted label
- [x] Full screen-by-screen audit: grepped every screen/component for icon-wrapper squares (none found), invisible text combos (none — false positives from ternary same-line patterns), large category fills (only one thin-rail usage exists), Bin ID badge shadows (none), text-glyph icons (none). Found and fixed 2 real leftover v1 hex values the token retheme couldn't reach: `layout.tsx` viewport `themeColor` and the single-container label page's QR `fgColor`, both still `#050505` instead of the new `#212121`. Also bumped the bottom-nav active tab label from `text-yellow` (brand-500, ~3.9:1 on the dark bar) to `text-brand-200` for clearer contrast.

## 2. Container/Bin Display Codes
- [x] `displayCode` on Container type, unique per household
- [x] View / copy / edit / generate-next UI
- [x] Assign unassigned/preprinted code UI

## 3. QR/NFC Label System
- [x] Desktop batch label printing: select containers, unassigned labels, paper preset, offset, content toggles
- [x] Live preview grid = print sheet
- [x] Mock persistence for label batches/entries
- [x] Distinct "Export PDF" mock action — downloads a manifest of the just-created batch, clearly labeled as mock since real PDF generation isn't wired up. Shared `buildLabelPdfManifest` helper now backs both this and the Settings > Data & Export "Label PDF" card (which targets the most recent batch) instead of duplicating the logic.

## 4. Recursive Containers / Nested Browser
- [x] Types/selectors/search support unbounded nesting (verified, no depth assumptions)
- [x] Expandable accordion/tree browser UI — new "Browse" tab on `/locations` (Grid tab is still the default, preserving v1's landing view)
- [x] "One location open at a time" accordion (single `openLocationId` state; sub-container nodes expand independently of each other)

## 5. Item Attachments
- [x] Attachment type + store actions (add/list/delete)
- [x] Secondary/quiet section on Item Detail

## 6. Category-Scoped Extra Details
- [x] Field defs per category (Tool/Electronics/Document/Clothing)
- [x] Manual Add + Item Edit + Item Detail display

## 7. Quantity Everywhere
- [x] 0–9999 validation in store
- [x] Manual Add, Item Detail, AI Review (single + bulk)

## 8. Tags Browser
- [x] Tag list with counts, tag detail (photo-forward grid)
- [x] Desktop sidebar entry, mobile via Settings

## 9. Data & Export
- [x] Inventory CSV export (real — generated from live store data)
- [x] Photo archive export (mock manifest — no real photo binaries exist in the mock data layer)
- [x] Label PDF export (mock manifest — real PDF generation not wired up)
- [x] Full household data export (real JSON snapshot of the whole store)
- [x] Progress/completion/error states (simulated progress, ~10% simulated failure rate with Retry)

## 10. Trash / Delete Forever Consistency
- [x] Audited — v1 already correct (cascading trash, 30-day retention, restore, danger-treated delete-forever)

## 11. Navigation / Layout
- [x] Mobile bottom nav: Home, Search, Locations, Settings + Scan FAB — corrected to match the actual Figma frame (node 198:76) exactly, which has no Favorites tab; white pill instead of the old black one, with a small active-dot indicator instead of a filled icon circle
- [x] Desktop sidebar: Dashboard, Locations, Needs Review, Tags, Trash in the primary nav list; Search/Favorites/Activity moved to a secondary group; a Scan button now pinned at the very bottom (Figma has one, the app previously had no desktop Scan entry point at all); active-state changed from solid black to the quiet pale-tan pill Figma actually uses
- [x] Full-screen routes (capture, add, sign-in, household-setup, scan) remain chrome-free, unchanged

## 12. Supabase/Gemini Readiness
- [x] Supabase client utilities: `lib/supabase/client.ts` (browser, publishable key) and `lib/supabase/server.ts` (secret key, guarded by the `server-only` package so an accidental client import is a build error, not a runtime leak). Neither is wired into the store yet.
- [x] Gemini `VisionProvider` implementation: `lib/gemini/vision.ts` (server-only, real call via AI SDK `generateText` + `Output.object` structured output, `@ai-sdk/google` provider, `GEMINI_API_KEY`) behind a new `POST /api/v1/vision/detect` route, plus a client-safe `GeminiVisionProvider` in `lib/ai.ts` that only ever fetches that route. `MockVisionProvider` stays the active default — swapping is a one-line export change.
- [x] Migration SQL: `supabase/migrations/0001_init.sql` — full v2 schema (households through label_batch_entries, `containers.display_code`, `items.extra_details` jsonb, attachments, label batches/entries) with RLS policies scoped by household membership. Skipped a dedicated `export_jobs` table since Data & Export (§9) runs synchronously client-side with no server job to track — noted as a design choice, not an oversight.
- [x] `.env.example` added documenting the required/optional env vars without real values.
- Verified: build succeeds (the `server-only` guard would fail the build on a boundary violation), and grepped `.next/static` for both real secret values from `.env.local` — zero matches, confirming neither key reaches the client bundle.
- Scope honored: scaffolding only. Nothing in the running app calls Gemini or Supabase by default; the migration was never run against the real project; the one live-call test I could have run (a real photo through `/api/v1/vision/detect`) was deliberately skipped since a real `GEMINI_API_KEY` is present in `.env.local` and would have made an actual paid call.

## 13. Visual Fidelity Pass vs. Figma "v2 · Current design"
Feature work (items 1–12) was complete but the running app didn't actually look like the Figma v2 mocks — this was a design-fidelity-only pass, no new product features. Pulled real screenshots and `get_design_context` (exact hex/spacing/shadow values) from the Figma file for the Dashboard, Locations, Container/Item Detail, and Desktop Dashboard/Management frames, then fixed:
- [x] Brand color was measurably wrong: token repoint in a much earlier session used `#a1887f`, but Figma's actual brand action color is `#7d5f54`. Also corrected secondary text to `#75625a` (was `#8d7b73`) and card shadows to Figma's two-layer soft elevation.
- [x] Bottom nav was solid black with the wrong tab set — rebuilt white/pale per Figma, corrected tabs (see §11).
- [x] Search bar had the icon on the wrong side (right, should be left) and no keyboard-shortcut hint on desktop.
- [x] Removed a whole leftover v1 component (`UtilityRail`, the black "Find it fast / Scan item" bar) that doesn't exist anywhere in Figma v2 — the Scan FAB replaced its purpose.
- [x] Bin ID badges were a single flat gray everywhere; Figma hashes each bin to one of five pastel fill/border/text combinations (`lib/badge-color.ts`), applied consistently across the Dashboard, Locations browse tree, and the container's own detail page.
- [x] Dashboard (mobile + desktop) was missing entirely: household header, item/bin/review summary strip, and the "Action queue" card (Review/Photos/Loose chips) didn't exist. Rebuilt using only real store data — "Loose" (items with a location but no container) and "Photos" (items still on the generic photo emoji) are genuine computed selectors, not fabricated stats. The dashboard's item grid was replaced with a `BinCard` component matching Figma's photo-edge-to-edge container cards with a status dot (Review/Photo) that sits in the metadata row, never overlapping the Bin ID badge.
- [x] `PhotoThumb`'s fallback was flat gray (`#d9dbd8`); changed to a pale brand-tinted panel so empty/fallback cards read as designed, not placeholder.
- [x] Locations page defaulted to a photo-card grid; Figma's actual default is a flat list (pin icon chip + name + count + "Open"). Renamed the tab to "List" and rebuilt it; the "Browse" nested-tree tab kept its structure but got the same badge/card treatment.
- [x] Item Detail: added an inline quantity +/- stepper (Figma shows one; backed by the existing `updateItem` action, no new logic), split "Extra details" into its own card with a category pill, and rebuilt Attachments as 4 fixed kind-tiles (Receipt/Manual/Warranty/Other — dashed empty state or a colored file-type chip) instead of a dropdown + generic list. Action buttons reordered to Move/Edit/Favorite per Figma, with Archive/Move to Trash demoted to a quieter secondary row (kept reachable, not removed).
- [x] Desktop Management: added a subtitle, changed the inner container-tree's active-row treatment from solid black to the same quiet pale-tan pattern used everywhere else. Kept its two-panel (tree + table) layout rather than forcing Figma's flatter single-list structure, since that would have removed the tree-navigation capability — a functional regression, not a visual fix.
- [x] Search results list: switched from a photo-card grid to plain list rows (icon chip + name + breadcrumb), matching Figma's search frame.
- Real bug caught mid-pass (unrelated to visual work but found via the first Playwright load): `DisplayCodeSheet` and `ItemAttachments` selectors did `useInventoryStore(s => s.x.filter(...))` — a new array every render, which breaks Zustand's `useSyncExternalStore` snapshot check and causes an infinite render loop. Fixed by selecting the raw array and filtering in `useMemo`.
- Deferred (explicitly out of scope for this pass, or not yet reviewed against Figma): onboarding flow (1–8), NFC/QR tag setup screens (36–42), Confirm Dialogs/Move Sheet/Trash/Members/Invite screens, CSV Import Desktop, Desktop Review Queue, Print Labels Desktop, Additional States frame. These were not visually audited against Figma in this pass and may still carry v1-era styling in places the systemic token fix didn't reach.

## 14. Second Visual Fidelity Pass — full screen coverage sweep
§13 only covered the "especially" screens the previous instructions called out. This pass fetched Figma screenshots for **every remaining frame** on the "v2 · Current design" page (52 frames total) and cross-referenced against every existing route to find true gaps vs. styling-only mismatches, before touching any code.

**True gaps found** (Figma screens with no corresponding UI at all): the 8-screen onboarding wizard (Welcome w/ progress dots → Sign Up → Log In → Create Household → Invite Members → Add Locations → Add First Bin → Ready) and the 7-screen NFC/QR tag setup flow (iOS Native, Write NFC Tag, iOS Shortcuts fallback, Bin Tag Linked, Android Native, QR-only fallback, Shortcuts setup). Confirmed with the user before proceeding — explicitly deferred; not built this pass. The app currently covers these with a 2-screen shortcut (`/sign-in`, `/household-setup`) and one sentence of NFC text on the label page, respectively.

**Styling fixes applied** to the ~18 existing-but-previously-unreviewed screens:
- [x] Sign-in: was a full dark-theme (`bg-ink`) screen with no Figma equivalent — rebuilt light per the onboarding welcome frame's actual palette, kept the existing Google/email flow logic unchanged.
- [x] Settings, Trash, Household Members, Tags, Data & Export: converted from merged single-list-with-dividers to Figma's individually-bordered row cards with pale icon chips + "Open" affordance; added subtitles under each heading (all headings were centered/bare, Figma is consistently left-aligned-title-plus-subtitle).
- [x] Discovered and generalized a real pattern across ~8 screens: Figma uses a **solid black** button specifically for form-save / commit actions (Edit Item Save, Manual Add Save, Add Location/Container Save, Bin ID Save, Confirm Dialog's non-destructive confirm, Print Labels' Print action) — distinct from the taupe brand color used for primary navigation-style CTAs. The token system only had taupe-primary and quiet-secondary; added the black treatment inline at each of these specific call sites rather than a new global button variant, since it's contextual to "commit a form," not a blanket rule.
- [x] `ConfirmDialog`: default-tone confirm button was quiet pale (matched neither Figma's black "Delete" nor taupe "Restore"); changed to black, with the icon chip staying danger-red specifically for `icon="trash"` regardless of tone, matching Figma's red trash icon on a black button.
- [x] Capture and Scan flows: both were full-screen dark (`bg-ink`) in *every* mode. Figma only uses dark for the actual live camera viewfinder — permission-denied and requesting states are light-themed cards. Split the styling by mode instead of forcing one theme for the whole flow.
- [x] CSV Import Desktop, Print Labels Desktop, Tag Label Print: added Figma's outer-card/header-subtitle treatment, fixed icon-chip colors, added the missing Bin ID badge to the single-container label page (it only showed the raw `tagToken`, never the human-facing display code).
- Reviewed and intentionally left alone (structurally different from Figma but not a v1 leftover, and rebuilding would mean removing working capability, not fixing styling): `MoveSheet` (tap-to-pick tree vs. Figma's two-dropdown-plus-confirm form — the tree pattern is already used consistently elsewhere), `EntityFormSheet` for Add Location/Bin (bottom sheet vs. Figma's full page — sheet is a reasonable, common mobile pattern for a quick add), Desktop Management's two-panel tree+table layout (kept from §13 for the same reason), Review queue (richer inline-edit rows vs. Figma's simpler Edit/Approve buttons — an enhancement, not wrong).

## 15. Third Visual Fidelity Pass — targeted bug reports, backend audit, and two new features
Same "measure, don't assume" discipline as §13/§14, but this pass was driven by specific user-reported bugs rather than a systematic screen sweep, plus a first real look at the backend (still scaffolding-only per §12) and two features the mocks didn't cover at all.

**Targeted bug fixes** (each root-caused via Playwright computed-style/bounding-box measurement, not guessed):
- [x] Bin ID badge typography, badge font-size silently dropped by a `tailwind-merge` custom-token gap (`lib/utils.ts`'s `cn()` now uses `extendTailwindMerge` for the custom font-size scale)
- [x] Button/icon-chip radius overshoot — this app's `--radius-xl` is 24px (not Tailwind's default), so `rounded-xl` on button-sized elements ballooned into pills/circles; switched affected call sites to `rounded-md`
- [x] Dashboard Storage bins: grid → horizontal scroll-snap carousel with a scroll-driven magnify effect (`BinCarousel`), then fixed the carousel clipping its own card shadow (scroll container's padding didn't contain `--shadow-sm`'s full extent — overflow-x-auto forces overflow-y to auto per the CSS spec)
- [x] `PhotoThumb`/`BinCard` emoji sizing (oversized dead space around fallback art) — including catching a same-fix regression (two `size-14` compact thumbnails would have inherited a new oversized default) before it shipped
- [x] `<main>`'s `max-w-[430px]` cap causing dead margins at mid-range mobile widths (only visible ≥600px, not at the 390px viewport used for the first, incomplete measurement)
- [x] Archive/Move to Trash buttons and the category Select dropdown — undersized tap targets and cramped popover padding
- [x] ConfirmDialog's Cancel/Confirm buttons collapsing to 22px on mobile: `flex-1` (`flex-basis: 0%`) overrides explicit height in a `flex-col-reverse` layout; switched to `flex-auto` so height wins
- [x] Locations List/Browse tabs undersized (32px pill, sub-44px trigger targets) — bumped to the app's 44px tap-target convention

**Backend audit** (`supabase/migrations/0001_init.sql` — still unapplied scaffolding, see §12): compared the migration against `lib/types.ts`/`lib/store.ts` field-by-field and against the PRD's stated invariants. Found and fixed four real gaps, each verified against a real local Postgres 17 instance (not just read) under a non-superuser `authenticated` role exercising RLS:
- [x] One-Owner-per-household enforced via a partial unique index + `transfer_ownership()`/`create_household()` security-definer RPCs (atomic role-flip via `CASE`, avoiding a transient two-owner state)
- [x] RLS on households/members/invites tightened from blanket per-member read/write to owner-gated writes, matching what `settings/members` already enforced client-side only
- [x] Container cycle prevention (BEFORE INSERT/UPDATE trigger, recursive CTE) — this surfaced a **live, reachable bug in the mock UI**: `MoveSheet` let you move a container into its own descendant with zero filtering; fixed both the DB trigger and the client-side exclusion, plus added the matching `moveContainer` → nested-container/item location cascade the DB trigger now also performs
- [x] `items.location_id` kept in sync with its container's location via trigger (mirrors the mock's denormalization convention)
- [x] `accept_invite()` security-definer RPC added, keyed off the caller's authenticated email (`auth.email()`) against `invited_email` — not a client-supplied string — closing the "no UPDATE policy" gap noted when invites RLS was first tightened

**New feature — per-item ownership** (roommate households, not just families): `Item.ownerUserId` (nullable — null reads as "Shared"), set from the Add/Edit item forms, shown on the Item Detail page. Single-owner, not multi-owner, by design (covers the common case; a join table can replace it later without touching unrelated code).

**New feature — household onboarding + real multi-household support**: verified the 5-step Figma onboarding wizard (Create Household → Invite Members → Add Locations → Add First Bin → Ready, frames 257:82–257:219) had **no corresponding UI at all** — `/household-setup` was an orphaned single-screen stub nothing linked to, and sign-in always pushed straight to `/`. Built:
- [x] Store: `household` (singular) → `households[]` + `currentHouseholdId`, with per-household data swapped via an in-memory cache on `switchHousehold()` so edits survive switching back and forth within a session; `createHousehold()` mirrors the migration's RPC
- [x] The actual 5-step wizard, matching Figma, wired to real store actions at every step (not static copy — the Ready screen's checklist reflects what was actually created)
- [x] Sign-in now routes a known member email (or the default Google path) to the dashboard, and an unrecognized email into onboarding — so the new-signup path is reachable/demoable, not just structurally correct
- [x] Settings → My Households: switcher between households the user belongs to, plus entry points to create another or redeem an invite
- [x] Invite acceptance wired end-to-end: a third seed household ("The Chen House") the user is *not* initially a member of, with a pending invite to her email, redeemable via the wizard's join mode — calls the mock's `acceptInvite()`, which mirrors `accept_invite()`'s email-matching logic

## 16. NFC/QR Tag Setup Flow — the other §14 deferral, now closed
§14 flagged two true gaps with no UI at all: the onboarding wizard (closed in §15) and this 7-screen NFC/QR tag setup flow (frames 265:2–272:29: iOS Native, Write NFC Tag, iOS Shortcuts Only, Bin Tag Linked, Android Native, QR Only, Shortcuts Setup Steps). Previously the app had one sentence of static NFC text on the label page and no way to actually link a tag.

- [x] `Container.nfcLinkedAt` (nullable timestamp) added — types, seed, migration column, and a `linkNfcTag()` store action/`accept`-style mock write, so "linked" is real state, not a route transition with nothing behind it
- [x] One page (`containers/[id]/nfc-setup`) covers all 7 frames as 5 UI states across 3 platform branches — matches the household-setup wizard's established "step state machine in one route" pattern rather than 7 separate routes
- [x] Platform branching is **real** capability detection (user-agent sniffing for iOS/Android/other, verified independently per branch via a spoofed Playwright `userAgent`), not a fake toggle — but the actual "write" action is a timed simulation on every platform, since no browser can write NFC here without physical hardware; this matches the app's existing real-vs-mocked boundary (e.g. `MockVisionProvider`), not a shortcut specific to this feature
- [x] iOS gets the Shortcuts-fallback path (a real, separate iOS system feature, not a lesser copy of Android's native write — Web NFC doesn't exist on iOS in any browser, which is the actual reason Shortcuts exists as a fallback); Android gets native write; desktop/other gets QR-only
- [x] Entry point wired from the existing label page, replacing the static text block with an actionable card that also shows a "Linked" status once `nfcLinkedAt` is set
- [x] Platform detection uses `useSyncExternalStore` (server snapshot `"other"`, client snapshot from `navigator.userAgent`) rather than `useEffect` + `setState`, avoiding the cascading-render lint error that pattern trips and the SSR/CSR hydration mismatch a naive `useState(() => detectPlatform())` would have caused

## 17. Post-§16 gap audit: one real regression fixed, one DB gap closed
A fresh audit (not a specific bug report) turned up four candidates: (1) cross-household FK validation, (2) a missing "Leave Household" action, (3) a real regression in this session's own multi-household work, (4) the label_batches status lifecycle. Scoped to fixing (3) immediately and closing (1) next; (2) and (4) remain open (see below).

- [x] **Regression fix**: `lastUsedDestination` (the Add Item/Capture destination prefill) wasn't part of `HouseholdSeedBundle`, so `switchHousehold()`/`acceptInvite()` left it untouched across a switch — adding an item right after switching households without picking a location explicitly silently inherited the *previous* household's `locationId`/`containerId`, a dangling reference invisible from any real location in the new household. Now scoped and restored per household like everything else the store swaps.
- [x] **Cross-household reference validation** (PRD §22's blanket rule, previously only enforced for a row's *own* `household_id`, never its FK *targets*): added validation triggers so a container's `location_id`/`parent_container_id`, an item's `location_id`/`container_id`/`owner_user_id` (member-of-household, not just FK-match, since `owner_user_id` references `auth.users` directly), an `item_tags` row's item+tag pair, an attachment's `item_id`, and a `label_batch_entries` row's `batch_id`/`container_id` must all resolve to the same household as the row itself. Verified against a scratch local Postgres 17 instance: 13 targeted cases (one per relationship, both the cross-household failure and the legitimate same-household success), plus a regression check that the existing container-move cascade (§ earlier) still fires correctly through the new validation trigger rather than being blocked by it.

## 18. Leave Household (PRD §13/§29) — the last §17 candidate for now
PRD §13/§29: "Leave Household (Member; blocked with a prompt to transfer first if the caller is the sole Owner)" plus a required confirm dialog. Join/switch/create all existed; leaving didn't.

- [x] RLS: `members` gets a new self-delete policy (`user_id = auth.uid() and role <> 'owner'`) — but the **pre-existing** "owner can delete any member" policy had no exclusion for deleting *themselves*, so an Owner could leave straight through that policy even with the new one correctly blocking them. Multiple permissive policies for the same command OR together, so the restriction has to hold in every policy that could grant it, not just the newest one. Fixed by adding `and user_id <> auth.uid()` to the existing owner-delete policy. Caught by testing, not by reading the SQL — worth calling out since it's exactly the kind of interaction easy to miss without applying it.
- [x] `leaveHousehold()` in the mock store: blocked if the caller is the household's Owner, blocked if it's their only household (nothing to switch to), otherwise removes them from `members`, drops the household from `households[]`, and switches to another one the same way `switchHousehold()` does.
- [x] Settings → Members: a "Leave Household" action (hidden entirely if it's the user's only household — nothing useful to do). For an Owner it opens a dialog explaining they need to transfer ownership first (§13's "prompt to transfer"), not a raw error after the fact; for a plain Member it's a real confirm-and-leave.
- [x] Added `'left'` to the `ActivityAction` union and the migration's matching CHECK constraint (mirrors `'joined'`, already used for accepting an invite).

## 19. Label batch status lifecycle (PRD §22) — the last open item from §17
`label_batches`/`label_batch_entries` never had the PRD's `status` fields (`'draft'|'generated'|'printed'` / `'unassigned'|'assigned'|'printed'`) — a batch was either "exists" or didn't, with no way to tell whether it had actually gone to a printer.

- [x] `LabelBatch.status` and `LabelBatchEntry.status` added to types/migration. Entry status isn't independently settable — a DB `CHECK` ties it to `container_id` (`unassigned` iff no container, `assigned`/`printed` iff one is set), matching the mock's own derivation instead of trusting the app layer to keep them in sync.
- [x] `createLabelBatch()` now sets a batch to `'generated'` (not `'draft'` — the current UI has no save-for-later step, it always finalizes in one action) and each entry to `'assigned'`/`'unassigned'` based on whether a container was picked. `'draft'` stays the schema's default for a future flow that doesn't exist yet, not something today's UI produces.
- [x] New `markLabelBatchPrinted()` action — called when the user actually clicks Print (`window.print()`), not on PDF export, which stays at `'generated'`. Cascades `'printed'` to every entry in the batch.
- [x] `claimUnassignedLabel()` (binding a preprinted label to a container after the fact) now checks the *batch's* status: if the batch was already printed, the entry jumps straight to `'printed'` rather than sitting at `'assigned'` as if it were still waiting to go to a printer — the physical label already exists at that point.
- [x] Desktop → Label Printing's "Recent batches" list now shows a status pill per batch (verified visually: two batches side by side, one green "printed" from clicking Print, one "generated" from Export as PDF only).

## 20. Fresh gap audit round 2: trash auto-purge, attachment validation, a copy bug
Same "independent research, not a rehash" approach as §17 — five new angles checked (role/permission model, trash purge, RLS scope on inventory tables, attachment validation, invite limits). Three real findings; RLS scope and invite limits turned out to already match the PRD's actual intent, not gaps.

- [x] **Copy bug**: the onboarding wizard's invite step said "Editors can add, move, and archive inventory" — there is no "Editor" role anywhere in the data model (`Role` is `'owner' | 'member'`, matching the PRD exactly). Fixed to say "Members."
- [x] **Trash auto-purge** (PRD §14: trashed rows are "automatically and permanently purged by a scheduled job"): `permanently_delete_after` was computed and stored everywhere trash happens, but nothing ever read it — rows sat in trash forever past retention unless a human clicked "Delete Forever." Added:
  - Migration: `purge_expired_trash()` (security definer, since a scheduled job has no household/RLS context of its own) + a `pg_cron` schedule running it hourly. Deletes leaf-first (items → containers → locations) and only deletes a container/location once nothing still depends on it — `containers.location_id` and `containers.parent_container_id` are both `ON DELETE CASCADE`, so a naive "just delete expired locations" would cascade away a *not-yet-expired* container just because it lives under an expired parent. A bounded loop (10 iterations) resolves a multi-level expired container tree in one run instead of one level per cron tick. Verified against a scratch local Postgres 17 instance with the exact adversarial case (an expired location holding one expired + one not-yet-expired container, plus a 3-level expired nested chain): the not-yet-expired container and its location both correctly survive, everything actually expired is gone, confirmed idempotent on a second run. `pg_cron` itself isn't installed in the local Postgres@17 homebrew build, so the schedule call couldn't be verified locally — the function logic was tested directly (applying a copy of the migration with just the two `pg_cron`/`cron.schedule` lines stripped); the scheduling mechanism is a thin, standard Supabase-documented API this wasn't able to exercise firsthand.
  - Mock: `purgeExpiredTrash()` mirrors the same leaf-first/bounded-loop logic in JS. Called once eagerly at store creation (catches anything already expired at load) and every 60s via `setInterval` while the tab stays open (guarded for SSR — `typeof window !== "undefined"` — since this module can be evaluated server-side during Next.js's render pass). Verified via Playwright using `page.clock` (installed before navigation so the module-level `setInterval` schedules against the fake clock): trashed an item, jumped the clock 31 days forward with `setSystemTime` (instant, not 44,640 real interval ticks), fast-forwarded 61 fake-seconds to let the already-scheduled interval fire once, confirmed the item and two other seeded trash entries with varying days-left all correctly disappeared, Trash correctly shows its empty state.
- [x] **Attachment validation**: zero enforcement anywhere — no DB `CHECK` on `size_bytes`/`content_type`, no `accept` on the file input, no client or store-level check. Added a shared `lib/attachment-limits.ts` (10MB cap, image/PDF only — no PRD-specified number, a judgment call pending real Supabase Storage) used by both the file picker (`accept` attribute + a friendly pre-upload check) and `addAttachment()` itself (now returns `{ok, error}` instead of always succeeding), plus matching DB `CHECK` constraints so the same limits hold for a write that bypasses the client. Verified against a scratch Postgres instance: oversized, zero-byte, and disallowed-type inserts all rejected; valid PDF and image inserts succeed.

**Not gaps** (checked and ruled out): RLS granting full inventory read/write to any household Member (not just Owner) — intentional, matches the PRD's multi-person-edits-the-same-inventory model; Owner-gating is deliberately reserved for household administration only. Missing invite dedup/rate-limiting — an Owner-only, no-real-email-delivery mock action; worst case is a harmless duplicate row, not worth the complexity.

## 21. Migration applied to the real Supabase project
Every schema change this session (§15–§20) was verified against scratch local Postgres instances, but the migration itself had never touched the actual linked project (ref `wdzxdatgatmdbtfstcfn`, created 2026-07-24, confirmed `ACTIVE_HEALTHY`). `supabase migration list` showed `"remote":""` — nothing applied yet.

- [x] Dry run (`supabase db push --linked --dry-run`) confirmed a clean apply with no conflicts before touching anything live.
- [x] Applied for real via `supabase db push --linked`. Succeeded outright — including `create extension if not exists pg_cron`, which couldn't be verified locally since `pg_cron` isn't installed in the local Postgres@17 homebrew build. That was the one part of §20's purge job this session couldn't test firsthand; it's now confirmed for real.
- [x] Verified against the live database (read-only queries, not just "the push command exited 0"): all 14 tables present, RLS (`relrowsecurity`) enabled on all 14, all 13 functions present, the `purge-expired-trash` `pg_cron` job registered and `active: true` on its `'0 * * * *'` schedule, the one-owner and per-household-display-code partial unique indexes both present, and all 3 attachment `CHECK` constraints (`kind`/`content_type`/`size_bytes`) present.
- [x] Updated the migration's own header comment, which previously said "this migration has not been applied to any Supabase project" — no longer true.

**Still not live**: the schema is real and populated with RLS/triggers/functions, but holds no data, and nothing in the app calls it yet. Real Supabase Auth (sign-in is currently 100% fake) and rewiring `store.ts` from in-memory arrays to actual Supabase calls are both explicitly separate, not-yet-started efforts — the app continues to run entirely on the mock store for now.

## 22. Real authentication, as a gate only (Stage 2 of 3)
§21 made the schema real; this stage makes *who's signed in* real too, deliberately scoped to the gate and nothing deeper: the app's actual content (households, items, members, everything `useInventoryStore` returns) still comes 100% from the mock store, completely decoupled from whoever really authenticated. `store.ts` itself was not touched in this stage — that's Stage 3, not yet started.

- [x] **Three-tier Supabase client split**, since a single client can't safely serve all three trust levels the app needs:
  - `lib/supabase/client.ts` — browser client via `@supabase/ssr`'s `createBrowserClient` (not plain `createClient`), so the session lives in cookies rather than localStorage and is readable by the server/middleware.
  - `lib/supabase/server.ts` — repurposed (it previously held an unused secret-key client) into the session-aware, RLS-respecting server client for Server Components/Route Handlers, using `next/headers` `cookies()`. Cookie writes are wrapped in try/catch since Server Components can't set cookies (only Route Handlers/Server Actions can) — the proxy is what actually refreshes the session in that case.
  - `lib/supabase/admin.ts` — new file, preserving the *old* `server.ts`'s exact secret-key/RLS-bypassing behavior under a clearer name (confirmed via grep it had no existing callers before renaming its purpose out from under it).
- [x] `src/proxy.ts` (Next 16 renamed the `middleware.ts` convention to `proxy.ts` mid-session — see the deprecation note below): refreshes the session via `supabase.auth.getUser()` (not `getSession()`, which only trusts the cookie without validating it against Supabase) on every request, redirects unauthenticated visitors to `/sign-in` for any route outside `PUBLIC_PATHS` (`/sign-in`, `/auth/callback`), and redirects an already-authenticated visitor away from `/sign-in`. Fails open (returns the request untouched) if the Supabase env vars are missing, rather than locking the whole app out over a config error.
- [x] `app/auth/callback/route.ts` — new OAuth callback handler: exchanges the PKCE `code` for a real session via `exchangeCodeForSession`, redirects to `next` (default `/`) on success or back to `/sign-in?error=...` on failure/missing code.
- [x] `sign-in/page.tsx` rewritten off the old mock-store "isKnownMember" routing stub entirely: real `signInWithPassword`, `signUp`, and `signInWithOAuth({provider: "google"})`. An explicit sign-in/sign-up toggle replaces trying to infer intent from Supabase's generic "invalid credentials" error (which can't distinguish "wrong password" from "no such account"). A `checkEmail` mode handles `signUp()`'s `data.session === null` case (email confirmation required, no session yet) instead of assuming signup always logs you in immediately.
- [x] Settings → Sign out now calls `getSupabaseBrowserClient().auth.signOut()` for real before navigating to `/sign-in`, replacing the previous fake `router.push` stub.
- [x] **`middleware.ts` → `proxy.ts` mid-session deprecation**: `next build` started warning that the `middleware` file convention is deprecated in favor of `proxy` (Next.js 16.0.0). Per this repo's own `AGENTS.md` — "heed deprecation notices," this codebase intentionally runs pre-release/changed Next.js behavior — renamed the file and its exported function (`middleware` → `proxy`) rather than leaving a deprecated convention in a freshly-written file. Confirmed via a stale-`.next`-cache false alarm along the way: after the rename, the dev server briefly reported "Proxy is missing expected function export name" even though the file was correct — caused by Turbopack's cache still referencing the old `middleware.ts`, not a real problem; `rm -rf .next` and a clean restart resolved it. `next build`'s route summary no longer shows the deprecation warning after the rename.
- [x] **Verification, three legs, all live (not just compiled)**:
  1. **Middleware/proxy gating**: an unauthenticated visit to `/settings` (and other protected routes) redirects to `/sign-in`; `/sign-in` itself stays reachable while unauthenticated.
  2. **Google OAuth initiation**: clicking "Continue with Google" was captured mid-redirect — a genuine `accounts.google.com` URL carrying this project's real `client_id` and the correct Supabase-project callback URL, confirming the dashboard-side provider setup the user did is actually wired up (a real Google login itself wasn't attempted, since that requires a real account).
  3. **Email/password round trip**: `signUp()` against synthetic test addresses hit two Supabase-side walls unrelated to this app's code — `@example.com` is rejected outright as an invalid/reserved domain (400), and real-looking test domains (`@gmail.com`, `@outlook.com`, a made-up `.dev` domain) all hit Supabase's default email-send rate limit (429) once no custom SMTP is configured. Both are project-level Supabase behavior, not a defect in `signUp()`'s wiring. Verified the rest of the chain instead by creating a pre-confirmed user directly via the Admin REST API (`POST /auth/v1/admin/users` with `email_confirm: true`, bypassing the rate-limited confirmation email) — real `signInWithPassword` succeeds and lands on `/`, `/settings` becomes reachable, real sign-out returns to `/sign-in`, and the gate re-engages afterward (`/` and `/settings` both redirect back to `/sign-in`). Test user cleaned up via `DELETE /auth/v1/admin/users/{id}` afterward.
  4. A 22-route Playwright console-error sweep while authenticated (mobile viewport) came back clean.
- [x] `tsc --noEmit`, `eslint .`, and `next build` all clean after the proxy rename.

**Still mock**: everything the signed-in user actually *sees* — households, items, members, tags, activity — still comes entirely from `store.ts`'s in-memory arrays, deliberately decoupled from real identity per this stage's "gate only" scope. Rewiring the store itself to call Supabase for real is Stage 3, a separate, larger, not-yet-started effort.

## Verification
- [x] `tsc --noEmit` clean (after every individual screen fix, not just at the end)
- [x] `eslint .` clean
- [x] `next build` clean
- [x] Playwright console-error sweep re-run after this pass — 28 routes × 2 viewports (mobile 390×844, desktop 1440×900), **zero console errors**
- [x] §15's migration changes verified against a scratch local Postgres 17 instance (initdb + pg_ctl, mock `auth.uid()`/`auth.email()`, an `authenticated` role to exercise RLS as a real non-superuser) — every invariant's success *and* failure paths (owner-only writes, the one-owner index, cycle rejection, invite expiry/wrong-email/already-redeemed) behaved as designed, not just "applied without error"
- [x] §16's migration column re-verified the same way; the NFC flow itself verified via Playwright with a spoofed `userAgent` per platform (iOS native write → linked, iOS Shortcuts info → steps → linked, Android native write → linked, desktop → QR-only), plus the label page's before/after "Linked" badge state
- [x] §17's `lastUsedDestination` fix and cross-household validation triggers verified per that section's own notes above
- [x] §19's CHECK constraint verified against a scratch Postgres instance (default status is `'draft'`, an `'assigned'`/`'unassigned'` mismatch against `container_id` both rejected, the valid combinations accepted, an invalid batch status rejected); the UI flow verified via Playwright (Export as PDF → `'generated'` badge, Print → `'printed'` badge, both visible together in Recent batches)
- [x] §20's `purge_expired_trash()` and attachment `CHECK` constraints verified per that section's own notes above (the adversarial cascade-safety case, idempotency, and all 5 attachment validation cases); the mock's purge sweep and attachment validation verified via Playwright (clock-mocked 31-day jump correctly purges expired trash while a would-be-cascaded container survives; oversized/wrong-type file picks correctly rejected before ever reaching `addAttachment()`)
- [x] §18's RLS policy interaction verified against a scratch Postgres instance (Owner blocked from self-delete through *either* policy, a Member blocked from deleting someone else, a Member successfully leaving, and — regression check — an Owner still able to remove another member the normal way); the UI flow verified via Playwright (Owner sees the transfer-first prompt and nothing changes, a Member joins a third household as non-Owner, leaves it for real, and the household list reflects it afterward)
- [x] §17's `lastUsedDestination` fix verified via a Playwright round trip (switch household → confirm Add Item prefills that household's own destination, not the previous one's → switch back → confirm the original is intact); §17's validation triggers verified against a scratch Postgres instance, 13 cases covering every new relationship's failure and success path plus a cascade-still-works regression check
- [x] Visual spot-check via Playwright screenshots against the downloaded Figma references for the highest-change screens (Settings, Sign-in, Locations, Item Detail)
