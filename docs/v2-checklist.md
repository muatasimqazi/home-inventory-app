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
- [x] Mobile bottom nav: Home/Search, Locations, Favorites, Settings + Scan FAB (Home tab already leads with a search bar, satisfying "Home/Search")
- [x] Desktop sidebar: Dashboard, Locations, Needs Review, Tags, Trash now in the primary nav list; Search kept first-class near the top; Favorites/Activity preserved from v1; Settings anchored at the bottom of the desktop-utility group
- [x] Full-screen routes (capture, add, sign-in, household-setup, scan) remain chrome-free, unchanged

## 12. Supabase/Gemini Readiness
- [x] Supabase client utilities: `lib/supabase/client.ts` (browser, publishable key) and `lib/supabase/server.ts` (secret key, guarded by the `server-only` package so an accidental client import is a build error, not a runtime leak). Neither is wired into the store yet.
- [x] Gemini `VisionProvider` implementation: `lib/gemini/vision.ts` (server-only, real call via AI SDK `generateText` + `Output.object` structured output, `@ai-sdk/google` provider, `GEMINI_API_KEY`) behind a new `POST /api/v1/vision/detect` route, plus a client-safe `GeminiVisionProvider` in `lib/ai.ts` that only ever fetches that route. `MockVisionProvider` stays the active default — swapping is a one-line export change.
- [x] Migration SQL: `supabase/migrations/0001_init.sql` — full v2 schema (households through label_batch_entries, `containers.display_code`, `items.extra_details` jsonb, attachments, label batches/entries) with RLS policies scoped by household membership. Skipped a dedicated `export_jobs` table since Data & Export (§9) runs synchronously client-side with no server job to track — noted as a design choice, not an oversight.
- [x] `.env.example` added documenting the required/optional env vars without real values.
- Verified: build succeeds (the `server-only` guard would fail the build on a boundary violation), and grepped `.next/static` for both real secret values from `.env.local` — zero matches, confirming neither key reaches the client bundle.
- Scope honored: scaffolding only. Nothing in the running app calls Gemini or Supabase by default; the migration was never run against the real project; the one live-call test I could have run (a real photo through `/api/v1/vision/detect`) was deliberately skipped since a real `GEMINI_API_KEY` is present in `.env.local` and would have made an actual paid call.

## Verification
- [x] `tsc --noEmit` clean (after each phase)
- [x] `eslint .` clean (after each phase)
- [x] `next build` clean (after each phase)
- [x] Smoke-tested new routes against the running dev server (curl + content checks)
- [ ] Playwright screenshot/console sweep (Playwright not currently installed in `node_modules`)
