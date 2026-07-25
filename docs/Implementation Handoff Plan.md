# Shohaz — Implementation Handoff Plan

Companion to the [Product Requirements Document](Product%20Requirements%20Document.md) (PRD). That document is the source of truth for product scope and behavior; this document translates the current Figma file into an engineering-ready build plan: what to build first, what maps to what, and what's still ambiguous. Where this document and the PRD disagree, the PRD wins — flag the conflict rather than resolving it silently.

Grounded in a full read of the PRD, the current 32-frame Figma file ("Shohaz," Qualia+ team), and a document-wide scripted audit of every color, radius, spacing, shadow, icon, and component in use (1,349 nodes scanned) — not a visual skim. Numbers below are counts from that audit, not estimates.

---

## 1. MVP Implementation Roadmap

The Figma file is materially ahead of a normal "design phase" — 32 frames covering nearly every PRD screen — but it is a **visual reference, not a component library** (see §2). That changes the build order: don't start by importing Figma components, start by building the token/primitive layer the mocks imply, then the shared composite components, then screens in the order below.

**Phase 0 — Foundation (before any screen is "done")**
- Land the token layer in code: Tailwind theme extension for color/radius/spacing/shadow (§3 below), plus the SF Pro / `system-ui` font stack.
- Install Lucide React and build the icon set named in PRD §3 / `00 · Icon System` (19 icons). Do this before any screen work — every screen currently uses placeholder glyph characters (`⌕`, `□`, `♡`, `›`, etc. — 107 instances found across the file) instead of real icons, and swapping icons after screens are coded is pure rework.
- Resolve the destructive-action color decision (PRD §3, §19) — needed before `ConfirmDialog` exists, and several early screens (Trash, Item Detail) depend on it.
- Stand up the shadcn/ui primitives (`Button`, `Dialog`, `Sheet`, `Toast`, `Input`, `Table`) and restyle their defaults to the token layer once, centrally — this is the "don't let it read as default shadcn" requirement in PRD §3, and it's much cheaper to enforce once at the primitive level than per-screen later.

**Phase 1 — Core mobile loop (the product's reason to exist)**
This is the "find in 10 seconds / capture in 15 seconds" loop from PRD §5 — build and prove this before anything else, since it's the entire product bet.
1. Dashboard (search + capture entry point)
2. Camera Capture
3. AI Review (single) + Bulk AI Review
4. Item Detail
5. Search Results

**Phase 2 — Manual/organizational completeness**
Needed for the loop to be usable without AI (permission-denied, correction, browsing):
6. Manual Add Item
7. Locations List → Container Detail (Location Detail has no dedicated frame yet — see §5 open items)
8. QR Scanner + Tag Label (printable)
9. Trash

**Phase 3 — Household & admin**
10. Sign-In, Household Setup
11. Settings, Household Members
12. Needs-Review Queue
13. Favorites, Activity Feed (both listed in PRD §29 but have no dedicated Figma frame yet — likely compositions of `ItemCard`/`ActivityFeedRow` rather than novel screens; confirm before scoping as "new design work")

**Phase 4 — Desktop management surface**
Deliberately last: PRD §8.6 frames desktop as the organizing/admin surface, not where new users land first, and it reuses most Phase 1–3 components at higher density rather than introducing new ones.
14. Desktop Activity Dashboard
15. Desktop Management (container tree, bulk actions)
16. CSV Import

**Phase 5 — Hardening**
- Dark mode (PRD §3 states this is required, not optional — currently 0% represented in the Figma file; every screen exists in light mode only)
- Empty/loading/error states beyond the dedicated reference frames (`21 · Dashboard States`, `22 · Search Empty + Loading`, `23 · Camera Permission + Preview`, `24 · Item Lifecycle States` exist and should be used as the spec for this pass)
- Accessibility/contrast pass — the yellow-as-text warning in PRD §3 is a real risk given `#FFC123` is a mid-brightness gold; verify every yellow-on-white and white-on-yellow pairing against WCAG AA before launch, not just yellow-as-fill.

---

## 2. Component Inventory

**Reality check first:** the Figma file has only **6 real COMPONENT/COMPONENT_SET definitions** in the entire document (1,349 nodes), all related to a single "UtilityRail" nav concept, and the underlying `UtilityRail` component set currently has a structural definition error (`componentPropertyDefinitions` throws "Component set has existing errors" when queried). There is also a duplicate, seemingly-newer `UtilityRail v2` set alongside it. **Do not plan on importing Figma components into code.** Treat every screen as a high-fidelity visual spec and build a real component library from scratch in React, using the table below as the map from "what appears repeatedly in Figma" to "what PRD §28 already named as a target component."

| Frontend component (PRD §28 name) | Figma pattern it's built from | Notes for implementation |
|---|---|---|
| `SearchBar` | Persistent search field, seen on Dashboard, Search Results, header of most list screens | Debounced, server-backed (§25) — no local-only filtering |
| `CaptureButton` | Yellow circular/pill camera CTA on Dashboard and nav rail | Primary-yellow token; always reachable per PRD §2 |
| `ItemCard` | Repeated photo-forward card across Dashboard, Search Results, Container Detail, Favorites | Photo dominant, name + breadcrumb only — no field-heavy layout (PRD §3 "if it looks like a form, it's wrong") |
| `ContainerCard` / `LocationCard` | Repeated card on Locations List, Container Detail | Thumbnail + name + item count |
| `AIReviewForm` | `03 · AI Review (Single)` body | AI-sourced fields need a visually distinct treatment (PRD §10.5) — not yet consistently expressed in the mock, confirm treatment before building |
| `BulkReviewList` | `04 · Bulk AI Review` | Scannable/editable/removable list, deliberately not `AIReviewForm` × N — PRD flags this as needing its own design pass; current mock is a reasonable v1 but treat as provisional |
| `PhotoUploader` | Capture/upload zone, `02 · Camera Capture`, `23 · Camera Permission + Preview` | Needs an offline-pending visual state — check `24 · Item Lifecycle States` for the spec |
| `TagScannerView` | `27 · QR Scanner` | Camera viewfinder + scan target overlay; NFC has no UI, OS-handled |
| `TagLabelView` | `11 · Tag Label` | Printable; must support desktop batch-print (PRD §8.6) |
| `Breadcrumb` | Location → Container path text, seen in Item Detail, Container Detail | Must disambiguate duplicate names (PRD §8.3) |
| `DesktopSidebar` | Left rail in `15 · Desktop Management`, `05 · Desktop Activity Dashboard` | Persistent location/container tree, desktop-only |
| `BulkActionToolbar` | Multi-select bar in `15 · Desktop Management` | Desktop-only |
| `ActivityFeedRow` | Row pattern in `05 · Desktop Activity Dashboard`; no dedicated mobile Activity Feed frame yet | Confirm mobile treatment before building — see §5 |
| `EmptyState` | `21 · Dashboard States`, `22 · Search Empty + Loading` | Illustrated, not just captioned, per PRD §3/§10.4 |
| `ConfirmDialog` | `26 · Confirm Dialogs` (3 variants: Move to Trash, Delete forever, Transfer ownership) | **Blocked on the destructive-color decision** — see §6 |
| `Toast` | Not explicitly present as a frame | No mock exists yet; build from shadcn's `Toast` primitive + token layer, confirm visual style with design before or during build |
| `MoveSheet` *(new — not in PRD §28 table)* | `25 · Move Sheet` | Bottom-sheet location/container picker; worth adding to PRD §28 since it's a real, distinct, reusable component the mocks introduced that the PRD component table doesn't yet name |
| `UtilityRail` / bottom nav | The one real Figma component, currently broken | Rebuild as a plain React component using the visual spec (icons, active-state styling) rather than trying to import the broken Figma set |

---

## 3. Token Inventory

All values below are extracted directly from the Figma file via a full-document scripted audit (1,349 nodes), not sampled by eye. Where the file currently contains near-duplicate values, the table shows the recommended canonical token and flags what should collapse into it — this fragmentation is real and worth fixing before component code freezes it in more places.

### Colors

| Token | Hex | Figma usage count | Role |
|---|---|---:|---|
| `color-ink` | `#1C2632` | 433 | Canonical near-black: text, secondary buttons, utility rail, bottom nav, high-impact panels |
| `color-white` | `#FFFFFF` | 266 | Base surface |
| `color-yellow` | `#FFC123` | 117 | Primary actions, active states |
| `color-surface-muted` | `#F1F3F5` / `#EFF1F2` | 60 | Inset/secondary surfaces — two near-identical cool grays in use, pick one |
| `color-text-muted` | `#747B82` | 56 | Secondary/caption text |
| `color-border` | `#D8D8D2` / `#D9DBD8` | 95 | Hairline borders — two warm-gray variants in use, pick one |
| `color-danger` | *not yet defined* | — | Needed for irreversible-delete confirmation — see §6 |

**Fragmentation to clean up before build:** `#050505` (101 uses), `#141414` (21), `#000000` (5), `#0D0F12` (4) are all near-black variants that should collapse into `color-ink`. `#FFCC00` (18 uses) is a second yellow that should collapse into `color-yellow`. This isn't cosmetic — leaving 5 different "blacks" in the codebase means five different Tailwind arbitrary-value classes instead of one `bg-ink`, and drift will only get worse once engineering starts copying values off screenshots.

**Confirmed excluded:** `#FFE1D1` and `#FFF3C1` — zero matches anywhere in the file (checked with RGB-distance tolerance). Keep excluding them.

**Category accent trio** (item-type color-coding only, never chrome/actions): `#FFC123` yellow, `#FD8549` orange (2 uses, reference frame only), `#F20855` pink — shown in `00 · Editorial Utility System` as colored dots on item rows.

### Typography

Already fully specified in PRD §3 as a concrete scale (Display 30/36 down to Micro 11/14, all SF Pro Medium/Regular) — no further extraction needed here. Confirmed empirically that SF Pro renders correctly in this Figma file (a caveat note on the `00 · Typography System` frame claims otherwise; tested directly via screenshot and found the claim inaccurate). Only two font families exist in the entire file: `SF Pro` (product) and `Inter` (isolated to the reference frame itself, not used on any real screen).

### Spacing

Actual `itemSpacing`/padding values in use are fragmented, clustering loosely around a few numbers rather than following one clean scale — dominant padding values found: **16, 14, 13, 10** (in that order of frequency), dominant gaps: **0, 5, 2, 8, 14**. This reads as an approximately-8pt scale that drifted (14 where 16 or 12 was likely intended, 13 where 12 was likely intended, 5 where 4 or 8 was likely intended) rather than a deliberate second scale.

**Recommended canonical scale** (align to Tailwind's default spacing so classes stay simple): `space-1` 4, `space-2` 8, `space-3` 12, `space-4` 16, `space-5` 20, `space-6` 24, `space-8` 32, `space-10` 40. Don't try to preserve the odd values (13, 14, 5) from the mocks — they're drift, not intent.

### Radius

21 distinct corner-radius values are in use across the file — real fragmentation, not a deliberate scale. Recommended consolidation:

| Token | Value | Maps to |
|---|---:|---|
| `radius-sm` | 8 | `rounded-lg` |
| `radius-md` | 12 | `rounded-xl` |
| `radius-lg` | 16 | `rounded-2xl` |
| `radius-xl` | 24 | Cards, panels, primary surfaces |
| `radius-full` | 999 | `rounded-full` — pills, avatars, circular buttons |

### Shadows / elevation

Two real tiers of elevation exist consistently across the file (not fragmented — this one's already clean):

| Token | Value | Usage count | Role |
|---|---|---:|---|
| `shadow-sm` | `0 3px 10px rgba(0,0,0,0.07–0.08)` | 104 | Default card elevation |
| `shadow-lg` | `0 8px 22–24px rgba(0,0,0,0.09–0.16)` | ~19 | Elevated panels, dropdowns, floating action button |
| `shadow-sheet` | `0 -8px to -10px 24–28px rgba(0,0,0,0.08–0.14)` | 2 | Bottom sheets rising from the screen edge (negative y-offset) — confirmed present, use for `MoveSheet` and similar |

### Icons

Recommend **Lucide React** (24px, rounded stroke) as the concrete library — names in `00 · Icon System` map closely to real Lucide icon names, and it's shadcn/ui's default icon set, so no extra dependency is introduced. Confirmed spec from that frame: stroke color follows surface (white on black rails, black on yellow active states, ink on light surfaces). MVP set (19 icons, per PRD §3): Home, Box, Heart, Settings, Search, Camera, Plus, Close (X), ChevronRight, ChevronDown, ArrowLeft, Edit (Pencil), Trash, Tag, User, Key, QrCode, Archive, Move.

**107 text-glyph placeholder icons** (characters like `⌕`, `□`, `♡`, `›`, `▣`, `⌂`, `×`, `→`, `←`, `✎`, `✦`) are currently in the file standing in for real icons — this needs a full sweep before any screen is "done," not a per-screen fix as engineering happens to encounter them.

---

## 4. Screen-by-Screen Implementation Notes

Only calling out screens with a real implementation-relevant note — screens not listed below (e.g. Settings, Household Members) match their PRD §29 design brief closely enough that no separate note is needed.

- **Dashboard** — Actively being iterated in Figma (item-card treatment, chevron affordances, and nav active-state style have changed multiple times during this design phase). Re-check the current frame state immediately before building, don't build from an earlier screenshot.
- **Camera Capture** — Correctly reflects the PRD's automatic single/batch detection (no manual toggle) — confirmed by direct inspection. Shows a "Session / N photos" counter not yet described anywhere in PRD §12; confirm intended behavior (does each photo start a new detection pass, or accumulate into one batch review?) before building.
- **AI Review (single) / Bulk AI Review** — `AIReviewForm` needs the "AI-sourced field" visual distinction PRD §10.5 calls for; not clearly expressed in the current mock. Flag with design before or during build rather than guessing at a treatment.
- **Trash** — Directly downstream of the destructive-color decision (§6) — the "Delete forever" confirm dialog it triggers is the one currently using yellow for an irreversible action.
- **QR Scanner / Tag Label** — Straightforward; Tag Label needs the desktop batch-print requirement (PRD §8.6) even though the Figma frame likely only shows a single label.
- **Locations List / Container Detail** — No dedicated **Location Detail** frame exists despite being named separately in PRD §29; confirm whether Locations List's drill-down state covers it or whether a mock is still needed.
- **Favorites / Activity Feed** — No dedicated frames exist for either, despite being named in PRD §29 as their own screens. `05 · Desktop Activity Dashboard` covers the desktop activity view; mobile equivalents are unbuilt. Likely compositions of existing components (`ItemCard` list / `ActivityFeedRow` list) rather than novel layouts — confirm this assumption with design rather than scoping them as new design work by default.
- **Desktop Management / Desktop Activity Dashboard** — Reuse Phase 1–3 components at higher density; no new component types expected here per the current mocks.
- **Dark mode** — PRD §3 requires full light/dark support; zero frames currently represent a dark variant. This is a real, unscoped gap, not a minor follow-up — size it explicitly rather than treating it as a design-system afterthought.

---

## 5. Remaining Open Questions

Carried into PRD §19 verbatim where implementation-relevant; repeated here with the supporting evidence for each.

1. **Destructive-action color is unresolved and currently inconsistent with the stated color system.** `26 · Confirm Dialogs` shows "Delete forever" using yellow (the primary-action color) and "Move to Trash" using black. Recommendation: add a dedicated `color-danger` token (muted red, distinct from the yellow/orange/pink accent trio) for irreversible actions only, reserve yellow for genuinely constructive actions. This blocks `ConfirmDialog`, and by extension Trash and Item Detail's delete flow.
2. **Figma componentization is minimal and partially broken.** Only 6 real components exist, all tied to one nav concept, and the underlying `UtilityRail` component set has a structural error. Engineering should not expect to import Figma components — budget real time to build a from-scratch component library using this document's §2/§3 as the spec, not as a "just wire up the Figma components" task.
3. **Four PRD-named screens have no dedicated Figma frame:** Item Edit, Location Detail, Favorites, Activity Feed (mobile). Need a quick confirm from design on whether these fold into adjacent screens or still need their own pass — this affects Phase 2/3 sizing.
4. **Camera Capture's "Session / N photos" counter** isn't described in PRD §12 — confirm the intended multi-photo-session behavior before building, since it affects the AI Review data model (one batch vs. several).
5. **AI-sourced field visual distinction (PRD §10.5)** isn't clearly expressed in the current `AIReviewForm` mock — needs a design pass or an explicit "use standard field styling" call before engineering guesses.
6. **Dark mode is fully unscoped.** Required by PRD §3, zero Figma representation currently exists. Needs to be sized as real work, likely a dedicated design pass per major screen category rather than a mechanical token-swap, since some screens (Camera Capture, black utility rails) may need different treatment than a naive color inversion.
7. **Two near-duplicate neutral-gray families** (`#F1F3F5`/`#EFF1F2` cool grays vs. `#D8D8D2`/`#D9DBD8` warm grays) — unclear whether this is intentional (e.g. cool gray for desktop chrome, warm gray for mobile) or drift. Confirm with design before picking one canonical value per token.
8. All open items already tracked in PRD §19 (batch-detection quality validation, CSV import dedup strategy, HA integration details, etc.) still stand — not repeated here.

---

## 6. PRD Updates Made

The following were added directly to the PRD (`Product Requirements Document.md`) as part of this handoff, since they're implementation-relevant decisions, not planning-document content:

- **§3 Design Language** — replaced the color/radius/icon TODO with concrete token values (color table, radius scale, icon library recommendation), each sourced from the Figma audit above, plus an explicit call-out and recommendation on the destructive-action color gap.
- **§19 Open Questions** — added three new bullets: the destructive-action color decision, the Figma componentization gap (broken `UtilityRail` set, only 6 real components), and the four PRD-named screens with no dedicated Figma frame.

Not changed, but worth a follow-up edit once resolved: PRD §28's component table doesn't yet name `MoveSheet` (a real, distinct component the mocks introduced) — add it once the component is built and its interface is stable, rather than now while it's still provisional.
