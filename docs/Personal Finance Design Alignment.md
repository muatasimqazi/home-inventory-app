> **Relocated 2026-08-17** from a separate repo (`personal-finances`, local-only, never pushed) into this repo's `docs/`, alongside the [Personal Finance PRD](Personal%20Finance%20PRD.md) — see the [Personal Finance Addendum](Personal%20Finance%20Addendum.md) for why. Content below is unchanged from the original except the cross-reference to the PRD, which now points at its new local filename.

# Design Alignment with Shohaz — Token Mapping & Adoption Plan

**Status:** Spec only — no application code exists yet for this domain (confirmed at the time this was written: no finance-specific `globals.css` additions, no finance component library, no implemented finance navigation). This document is the plan to apply once finance screens are actually built, per PRD [§34](Personal%20Finance%20PRD.md#34-alignment-with-shohaz-home-inventory-app) and [§35](Personal%20Finance%20PRD.md#35-figma-design-specification).
**Date:** 2026-08-17
**Source of truth for target values:** `~/.claude/skills/design-from-scratch/references/shohaz-design-language.md` — verified against Shohaz's shipped `globals.css` and component source, not its docs.

Because there's no existing finance app to retrofit, this isn't a *current-token → target-token* remap in the literal sense the request describes — there are no current tokens. Instead, this is the token set finance screens will be **built with from the first one**, framed against Shohaz's verified values so building inside Shohaz's own codebase is a direct extension, not a rebuild. Every table below still does the job a remap table would: state the target value, and flag anywhere finance's domain needs something Shohaz's inventory domain never had to solve.

---

## 1. Color

Adopt verbatim, same names, same hex — no finance-specific reason to diverge on any of these:

| Token | Hex | Role |
|---|---:|---|
| `ink` | `#212121` | Primary text, active icons, focus ring |
| `yellow` *(legacy name, not literally yellow)* | `#7d5f54` | Primary buttons, active utility states — white text/icons on top |
| `white` | `#FFFFFF` | Cards, sheets, nav bar |
| `background` | `#FAF8F6` | Page background |
| `surface-muted` | `#F1EDED` | Recessed surfaces, inputs, no-photo/no-icon fallback panels |
| `border` | `#E4DDD8` | Hairline borders/dividers |
| `text-muted` | `#75625A` | Secondary/caption text, inactive icons |
| `danger` | `#A31B1B` | Irreversible actions only (permanent delete) |
| `brand-100` / `brand-200` / `brand-700` | `#F2EDEA` / `#D0C2BA` / `#715C52` | Fuller taupe ramp — panels, borders, emphasis |

**Judgment calls — Shohaz has no equivalent, these need a real decision:**

| Gap | Why Shohaz doesn't help | Proposal |
|---|---|---|
| **Positive / negative amount color** | Inventory has no "good/bad number" — nothing in Shohaz's palette was built for a debit/credit distinction. | A new semantic pair drawn from the *same* warm-neutral family so it doesn't read as a foreign accent dropped into a taupe world: a muted forest/olive green for positive (income, credit, net-worth-up) and a muted brick/rust red for negative (expense, debit, net-worth-down). **Explicitly not `danger`** — that token is reserved for irreversible actions per Shohaz's own rule, and reusing it for ordinary expense amounts would dilute the one place it's supposed to mean something serious. |
| **Category-accent hue count** | Shohaz's category-accent trio (`#C9974B` / `#C1774A` / `#B06B79`, hashed) was sized for a small, mostly-fixed item-category list. Finance's category set (defaults + household customs + subcategories) will plausibly run to 10–15+ distinct categories. | Keep the *mechanism* (deterministic hash → accent, never a manual lookup table) but extend the hue set to 5–6 values in the same taupe/warm family, to reduce visible repeats on a longer category list. Same hashing function, larger palette. |
| **Chart colors** (net-worth trend, cash-flow bars, category breakdown) | Shohaz has zero charts — inventory has no dataviz surface at all. | Derive from what already exists rather than a new rainbow palette: `brand-700`/`yellow` for single-series lines (net worth trend), the new positive/negative pair for cash-flow (income vs. expense bars), and the extended category-accent set for the category-breakdown chart. |

**Contrast check actually run, 2026-08-18 (this was deferred through the whole build — done now, before implementation, not left as a hope):** the 6 category-accent hues (`#C9974B`, `#C1774A`, `#B06B79`, `#8B9574`, `#7C93A8`, `#9B7B95`) were used as **text color** on category badges throughout the built screens (Transactions List, Categories & Rules, Category Breakdown legends). Computed WCAG contrast ratios against white/near-white badge backgrounds: **all six fail** — ranging ~2.5:1 to ~3.1:1 against the 4.5:1 AA minimum for normal text. This is exactly the failure mode the `dataviz` skill's own guidance warned about ("mid-brightness tones pass as a fill, fail as text") — confirmed true, not hypothetical.

**Fix: a second, darker "text-safe" variant per hue**, mirroring the pattern Shohaz's own badge palette already uses (pale `-bg` + separately-darkened `-text`, e.g. `badge-green-bg #e8f2e9` / `badge-green-text #1b5e20` in `globals.css`) — the category-accent trio/set never got this treatment when extended, only the original inventory badge colors did:

| Fill/dot (unchanged) | Text-safe variant (new) | Contrast vs. white |
|---|---|---|
| `#C9974B` | `#8F6B2E` | 5.1:1 |
| `#C1774A` | `#8A4F2A` | 6.6:1 |
| `#B06B79` | `#7D3F4A` | 7.9:1 |
| `#8B9574` | `#5C6449` | 6.0:1 |
| `#7C93A8` | `#4F6274` | 6.1:1 |
| `#9B7B95` | `#6B4F63` | 7.2:1 |

All six now clear AA comfortably. **Rule going forward: category-accent hues are for dots/bars/fills only; any place the category name/label itself is colored text uses the text-safe variant, never the fill hex directly.** Applied to the two most-referenced instances (Category Breakdown chart, Transactions List) as the corrected standard; the same substitution needs to be applied mechanically to the remaining badge instances (desktop Transactions, Categories & Rules dots-as-text if any, other Category Breakdown copies) during implementation — noting this explicitly rather than silently claiming every instance was hand-fixed.

---

## 2. Typography

Adopt Shohaz's 9-role scale verbatim — same sizes, same line-heights, same rule that hierarchy comes from size/line-height first and weight second (Medium is the only weight shift; no light/black variants; letter-spacing `0` throughout).

| Role | Size/LH | Weight | Shohaz's use | Finance's use |
|---|---:|---|---|---|
| Display | 30/36 | Medium | Brand/auth moments | Sign-in/sign-up screens — direct reuse |
| Desktop title | 26/32 | Medium | Desktop page titles | Accounts, Transactions, etc. page titles — direct reuse |
| Screen title | 22/28 | Medium | Mobile screen titles, modal titles | Same — direct reuse |
| Section title | 17/23 | Medium | Section headers, card titles | Dashboard sections ("Recent Transactions", "Upcoming Bills") — direct reuse |
| Item title | 15/20 | Medium | Item/Location/Container names | Account names, transaction merchant names, category names — direct reuse |
| Body | 14/19 | Regular | Form values, copy | Same — direct reuse |
| Body emphasis | 14/19 | Medium | Buttons, selected tabs | Same — direct reuse |
| Caption | 12/16 | Regular | Breadcrumbs, metadata | Account breadcrumb, transaction date/status — direct reuse |
| Caption emphasis | 12/16 | Medium | Badges, emphasized metadata | Category badge text, status pill text — direct reuse |
| Micro | 11/14 | Regular | Dense labels | Dense desktop table secondary text — direct reuse |

**One addition, not a conflict:** every currency amount (stat tiles, table rows, balances) gets `font-variant-numeric: tabular-nums` layered on top of whichever role sizes it — a modifier, not a new role. Shohaz never needed this because inventory has no columns of aligned numbers.

---

## 3. Radius

Adopt Shohaz's 5-token scale verbatim: `sm` 8px, `md` 12px, `lg` 16px, `xl` 24px, `full` 999px (pill).

| Element | Token | Notes |
|---|---|---|
| Account/stat cards, panels | `xl` | Matches Shohaz's card family exactly |
| Category badges, status pills, avatars | `full` | Matches Shohaz's pill/avatar convention |
| Inputs, filter chips | `sm`/`md` | Matches recessed-surface convention |
| Buttons | `lg` *(proposed — flagged below)* | |

**Resolved 2026-08-17** — checked directly against the real `Button.tsx` source once this lived in the same codebase: `rounded-lg` → `--radius-lg` = 16px, exactly as proposed. No longer a guess.

## 4. Shadow

Adopt Shohaz's 3 tokens verbatim — no gaps, clean mapping:

| Token | Shohaz's use | Finance's use |
|---|---|---|
| `shadow-sm` | Default card elevation | Account/transaction cards at rest |
| `shadow-lg` | Elevated panels, dropdowns, FAB | Same cards on hover; filter dropdowns; any popover |
| `shadow-sheet` | Bottom sheets (negative y-offset) | Transaction detail/edit surface *if* it behaves as a mobile bottom sheet — PRD §35 currently specs it as a right-side drawer on desktop; confirm the mobile treatment uses a sheet, not a full-screen push, when screens are actually built |

---

## 5. Iconography

Adopt Lucide React, 24px, rounded stroke, one family, stroke-color-follows-surface (never a fixed icon color) — verbatim rule, different functional subset (expected — Shohaz's set is inventory-specific, finance's is finance-specific, same discipline applies to both):

Dashboard/Home, Search, Wallet or Landmark (accounts), List (transactions), Tag (category), Repeat (recurring), TrendingUp (net worth), History (activity), Trash2, Settings, Plus, X, ChevronRight/ChevronDown, ArrowLeft, Pencil (edit), Filter, Upload (CSV import), Download (export), User (member), ArrowLeftRight (transfer), CheckCircle (posted), Clock (pending).

**Judgment call:** resist one icon per account type (7 types → 7 icons would repeat Shohaz's own "repeated one-off symbol is a design-system smell" warning). Propose 3–4 icons covering all 7 types by grouping (`Landmark` for checking/savings/loan/mortgage, `CreditCard` for credit cards, `Wallet` for cash, `TrendingUp` for investment) rather than a bespoke glyph per type.

---

## 6. Component patterns to adopt directly

| Shohaz pattern | Finance equivalent | Fit |
|---|---|---|
| `ItemCard`/`ContainerCard` — photo-flush, name+breadcrumb beneath, `shadow-sm→shadow-lg` hover, `ring-2 ring-ink` selected, doubles as button/link | `AccountCard` — leading area is an account-type icon in a tinted panel instead of a photo; same hover/selected/dual-purpose behavior | Clean 1:1, only the leading visual changes |
| `EmptyState` — icon chip + title + description + action, centered, never a bare caption | No-accounts, no-transactions, empty Trash, empty Activity Feed states | Direct reuse, zero judgment calls |
| `ConfirmDialog` — danger-red icon chip reserved for the one truly irreversible action; ink-tinted brand chip for everything recoverable | Permanent Delete (from Trash) gets the danger chip; Trash-an-account, Trash-a-transaction, Remove-member all get the ink chip | Direct reuse — and it validates that this app's own two-tier confirmation design (PRD §33) already matches Shohaz's reservation of danger-red, independently arrived at |
| `IconChip` — reusable colored-circle wrapper, `yellow`/`ink`/`muted`/`danger` tones | Same tones, reused across confirm dialogs, empty states, list rows | Direct reuse; may need one additional tone pairing for transaction-direction icon chips (income/expense) — same judgment call as §1's positive/negative color |
| Deterministic-hash category/badge coloring | Transaction category badges | Direct reuse of the *mechanism*; extended hue count per §1 |

---

## 7. Navigation shape — resolved below (§ ends with the 2026-08-17 resolution note; kept the original reasoning above it as the record of how it got there)

Shohaz: 4-tab bottom nav (**Home, Search, Locations, Settings**) + a 5th raised circular camera FAB, docked flush to the bottom edge.

This app's PRD (§35, written before this alignment pass) currently specs: **Dashboard, Transactions, Accounts, More** — 4 tabs, but different destinations, and **no FAB**. Two real structural differences, not just a labeling difference:

1. **Search isn't a top-level destination here.** Shohaz is search-first by product design (camera-and-search are the two dominant elements on its home screen); this app's search/filtering was designed as a capability *within* Transactions, not a dedicated tab. Forcing a Search tab in to match Shohaz would add a destination this app's own UX requirements (§19) never called for.
2. **No FAB-equivalent capture action.** Shohaz's FAB works because there's one dominant, instant, photo-based capture flow. This app has two: manual entry and CSV import, neither singular or instant the way pointing a camera at an object is. A circular "Add transaction" FAB is plausible but would be manufacturing a visual parallel that doesn't reflect an equally-dominant single action underneath it.

**The real question this raises, per your own instruction not to force a mismatch:** if these two apps merge into one, a naive concatenation doesn't fit — Shohaz already uses all 4 tab slots plus the FAB slot. A merged app needs either (a) a mode-switcher above the bottom nav (Home/Finance toggle, each keeping its own sub-nav), or (b) a genuinely unified nav with destinations drawn from both domains, which would mean *both* products' information architectures change, not just this one being bent to match Shohaz's current shape. That's a product decision for both PRDs, not something to resolve unilaterally in this document — flagging it here as the single largest open item this alignment pass surfaced.

*(Superseded framing note, added at relocation: "if these two apps merge" is no longer hypothetical — see the Personal Finance Addendum for the current decision to build this domain directly inside Shohaz. This section's actual recommendation — a mode-switcher — still stands as the live open question, just no longer contingent on a future merge event.)*

**Resolved, 2026-08-17, during the actual design pass — both open items above are now settled, one of them reversed:**

- **The mode-switcher won.** Household Hub Addendum §6 settled this: Shohaz's global nav is Home/Search/Scan/**More**, where More is a domain switcher into Inventory/Finance/Tasks, "each keeping its own sub-navigation once entered." Finance's own internal nav is exactly what point 1 above already specified (Dashboard/Transactions/Accounts/[catch-all]) — just renamed **Manage** (not More) to avoid two nested "More" tabs once you're inside Finance via the global one.
- **Point 2's "no FAB" call is reversed, not just revisited.** It was reasoned specifically on "this app has no dominant, instant, photo-based capture flow." The Receipt Scanning Addendum (written after this document) built exactly that flow — scan a receipt, AI extracts it, review, confirm — deliberately modeled on Shohaz's own capture pattern. The objection this section raised no longer holds, so Finance's mobile nav now gets a camera FAB (receipt scan) in the same position as Shohaz's, docked flush the same way. This is why "revisit the PRD when downstream decisions change the premise of an earlier one" matters — the original call wasn't wrong when made, it was made before information that later invalidated its own reasoning existed.

---

## 8. Adoption plan (once scaffolding begins)

Sequenced foundation-before-instances, per `design-from-scratch`/`app-from-scratch` methodology:

1. **Tokens layer** — land §1–5 above centrally in `globals.css` (or the Tailwind config equivalent), one change site, mirroring Shohaz's own approach. Resolve the judgment calls in §1–5 before or during this step, not after.
2. **Primitives** — Button, Card, Dialog, IconChip, EmptyState, badge/pill, built on the token layer, restyled to read as this app's own surface (per `craft`), not a recognizably-default shadcn look.
3. **Shared components** — `AccountCard`, `ConfirmDialog` (two-tier danger convention), category badges (hashed coloring), stat tiles (tabular-nums), CSV import wizard shell.
4. **Screens** — assembled from the above, in the build order the Implementation Handoff Plan sets, not frame-by-frame.
5. **Navigation shape** — resolved as its own product conversation (§7) before or alongside step 4, since it affects IA, not just visual styling.

Verification once code exists: typecheck/lint/build clean, full screenshot sweep across mobile and desktop breakpoints, contrast-checked specifically on the new positive/negative amount colors and the extended category-accent set (§1) — mid-brightness taupe/olive/rust tones are exactly the kind of thing that passes as a fill and fails as text.
