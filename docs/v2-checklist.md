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

## Verification
- [x] `tsc --noEmit` clean (after every phase, including the visual pass)
- [x] `eslint .` clean
- [x] `next build` clean
- [x] Playwright installed (`playwright`, `@playwright/test`) and used for real screenshot + console-error sweeps across mobile (390×844) and desktop (1440×900) — 28 routes × 2 viewports, zero console errors
- [x] Fixed the one real bug the sweep surfaced (infinite render loop, see above) and re-swept clean
