# Household Ledger — Implementation Plan

Companion to [v4 - Enhanced Features](v4%20-%20Enhanced%20Features) (the revised PRD). That document is the source of truth for scope and behavior; this document translates it into a build plan and a multi-agent execution strategy — what's already built, what's net-new, what can run in parallel, and what has to be sequenced.

Grounded in a read of the actual schema (`supabase/migrations/0001-0016`), the existing Ask tool implementation (`src/lib/ask/tools.ts`), the vision pipeline (`src/lib/vision/`), and the current onboarding (`src/app/household-setup/page.tsx`) — not the PRD in the abstract. Where this document and the PRD disagree on a detail, the PRD wins on product behavior; this document wins on *how little schema work some sections actually need*.

---

## 1. Reality check — what's already built

The finance side (accounts, transactions, receipt scanning, Plaid sync, recurring bills, push notifications) and a working Ask assistant already exist and are in production. That materially changes the plan: several PRD sections that read as "new capability" are mostly UI/wiring work against schema that's already there.

| PRD section | Looks like | Actually is |
|---|---|---|
| §28 Documents (receipts/warranties/manuals) | New document system | **Already modeled.** `attachments` table (`0001_init.sql`) already has `kind in ('receipt','manual','warranty','other')` tied to `item_id`. This is UI surfacing work, not schema work. |
| §27 Appliance lifecycle | New entity type | **Mostly modeled.** `items.extra_details jsonb` already exists for "category-scoped extra fields" (the comment in `0001_init.sql` literally gives `modelNumber` as the example). Needs a capture mode + review UI, not a new table. |
| §8/§9 Person, managed profiles, ownership | New concept | **Real gap.** `items.owner_user_id` references `auth.users(id)` directly — there is no Person distinct from an authenticated Member today. A managed child profile cannot own an item in the current schema. This needs a real migration. |
| §25 Transaction ↔ item linking | New concept | **Real gap, and it's the one that matters.** `scanned_receipt_line_items` (from receipt scanning) and `items` (inventory) have zero foreign-key relationship. `src/lib/ask/tools.ts` has `searchTransactions` and `findInventoryItems` as two completely separate tools today — this is the exact seam the audit identified as the product's actual differentiator, and it's genuinely unbuilt. |
| §26 Finance-triggered capture | New concept | **Net-new, but there's a pattern to follow.** `src/app/api/v1/push/send-due-bills/` is an existing scheduled-job-triggers-a-push pattern — the capture nudge is the same shape (watch new transactions instead of due bills). |
| §29 Home Map | New entity | **Net-new**, small. No location-pinning concept exists yet distinct from `locations` (which are storage spaces, not "where's the shutoff valve"). |
| §22 Onboarding restructure | Rewrite | **Real gap.** `household-setup/page.tsx` (608 lines) is the current mandatory flow this PRD explicitly removes household-member collection from. |

**Net effect:** the actual new-schema surface is small — one migration, not the sprawling model the original v4 draft implied. That's good news for parallelizing: less shared migration surface means less agent-to-agent collision.

---

## 2. Phase 0 — Foundation (one agent, sequential, do not parallelize)

**Status: done**, applied and verified against local Supabase (`supabase migration up --local`) — not yet pushed to the linked remote project, which is a deliberate separate decision (see §10). Wave 1 agents can branch against this now.

Everything below forks from this. Land it, review it, merge it to `develop` before any other agent branches.

**Migration `0017_household_ledger_core.sql`:**

- `people` table — `id, household_id, display_name, relationship, avatar_url, linked_user_id (nullable FK to auth.users), created_at`. Backfill: one `people` row per existing `members` row, `linked_user_id` set to that member's `user_id`.
- `items.owner_person_id uuid references people(id)` — add alongside existing `owner_user_id`; backfill `owner_person_id` from `owner_user_id` via the new `people` row for that user. Keep `owner_user_id` for one release as a read compatibility shim, then drop in a follow-up migration once all call sites are confirmed migrated (grep `owner_user_id` across `src/` before dropping).
- `item_purchases` table — `id, household_id, item_id → items, transaction_id → transactions (nullable), scanned_receipt_line_item_id → scanned_receipt_line_items (nullable), source ('manual'|'ai_suggested'|'finance_nudge'), linked_by_user_id, linked_at`. This is the entire schema §25 needs.
- `pinned_locations` table — `id, household_id, name, category ('water_shutoff'|'electrical_panel'|'gas_shutoff'|'hvac'|'network'|'wall_photo'|'other'), photo_path, location_note, created_by_user_id, created_at`.
- `event_log` table — `id, household_id, entity_type, entity_id, event_type, actor_user_id, occurred_at, metadata jsonb`. Append-only, no updates.
- RLS on all four, following the existing `is_household_member(household_id)` predicate used throughout `0001_init.sql`.

**Also in Phase 0 — item-detail componentization** (small, done now, not during Wave 1): the actual file is `src/app/(shell)/items/[id]/page.tsx` (the plan's §3 originally cited the wrong path — corrected here). Split into:

- `src/components/item-ownership-section.tsx` — the existing "Belongs to" cell, extracted with zero behavior change, ready for Workstream 2 to swap its internals to `people`/`owner_person_id`.
- `src/components/item-purchase-section.tsx` — new, currently renders `null`. A real, isolated file for Workstream 3 to fill in rather than a block it has to insert into the page component later.

**Correction from the original plan:** Documents (§28) didn't need a new `ItemDocumentsSection` — `src/components/item-attachments.tsx` already exists and already does exactly this (it's why §1's reality check found Documents schema-complete). Workstream 4 builds against that existing component, not a new one. `ItemDetailsSection` (quantity/category/notes/extra-fields) also wasn't extracted — nothing in Wave 1 contends for that block, so splitting it now would be refactoring without a reason; Workstream 7 (Appliances, Wave 2) can extract it then if it turns out to need to.

---

## 3. Wave 1 — parallel workstreams (fork after Phase 0 merges)

**Status: done.** All 5 dispatched in parallel (`isolation: "worktree"`, `run_in_background: true`), each on its own branch off the Phase 0 commit. Merged to `develop` in the planned order — Documents → Home Map → Onboarding → People & ownership → Finance ↔ item linking — with `pnpm exec tsc --noEmit` + full-repo lint clean after every merge. Final state: full-repo `tsc --noEmit` and `eslint` both clean.

| # | Workstream | PRD §§ | Primary files | Depends on | Actual outcome |
|---|---|---|---|---|---|
| 1 | **Onboarding rewrite** | 11–22 | `src/app/household-setup/page.tsx`, `src/app/sign-in/` | Phase 0 (`people` table) | Shipped as briefed. 608→~325 lines; auto-created household on arrival, no mandatory member step, optional "+ Add someone" via a stub `AddPersonSheet` (documented as disposable, since #2 was expected to supersede it). Flagged rather than built: freeform "Where was this?" space creation and the post-scan "+ Add someone" moment both live in `src/app/capture/review/page.tsx`, outside this workstream's file scope — real gaps, routed to a later pass. **Location-creation half fixed post-Wave-1** (see below) — the "+ Add someone" half is still open. |
| 2 | **People & ownership UI** | 8, 9, 23, 30 | `src/app/(shell)/settings/members/` → generalize to People; `AddPersonSheet` shared component (new); `src/components/item-ownership-section.tsx` (Phase 0) | Phase 0 | Shipped as briefed, plus the anticipated `AddPersonSheet` supersession of #1's stub. Managed-profile-vs-invite branch built (PRD §23); "Invite to the app" deliberately does *not* pre-create a Person row (see §9 below — real, unresolved). Flagged, not built: no junction table for "multiple people own this item" (schema is a single nullable FK); `settings/page.tsx`'s nav row still reads "Members" (cosmetic, out of file scope). |
| 3 | **Finance ↔ item linking** *(core — see note)* | 25 | `src/components/item-purchase-section.tsx` (Phase 0, currently a no-op); new "Link to item" affordance in `src/app/(shell)/finance/transactions/`, `src/app/finance/scan/review/`; extend `src/lib/ask/tools.ts` | Phase 0 (`item_purchases` table) | Shipped, plus a real `LinkPurchaseSheet` shared component and a `getItemPurchaseInfo` Ask tool. Got a full `/code-review` pass before merging (as planned) — surfaced and fixed on-branch before merge: a hard-delete/CHECK-constraint bug (deleting a transaction or receipt line item solely anchoring an `item_purchases` row would fail outright), an item-scoped-not-purchase-scoped "receipt attached" display bug, an unparsable-warranty-date-reads-as-"expired" bug (UI and Ask tool both), and archived/trashed items keeping live link/unlink controls unlike every other edit affordance on the page. Flagged, not fixed: three small pieces of duplicated logic across 2-3 files (link/unlink wrapper, price-fallback rule, date-proximity search) — maintainability debt, not bugs, left for a follow-up pass. |
| 4 | **Documents surfacing** | 28 | `src/components/item-attachments.tsx` (already exists, already isolated — confirm upload/view flows are complete against `attachments.kind`; do not add new kinds) | None — schema-complete, UI-complete component already exists; likely the fastest workstream to close out | Shipped exactly as sized: audited, found one real gap (an upload-in-progress tile showed no feedback and stayed clickable, risking a duplicate concurrent upload), fixed it, nothing else needed. Smallest diff of the five (~9 lines), no deviations. |
| 5 | **Simple Home Map** | 29 | New route under `src/app/(shell)/`, e.g. `home-map/`; capture flow reusing existing camera components | Phase 0 (`pinned_locations` table) | Shipped as briefed: one flat list route, private-bucket photos (not the public item-photos bucket — home-systems photos are the most sensitive category the product handles), additive `findPinnedLocations` Ask tool. Flagged, not built: no `event_log`/Activity-feed wiring, no `extractReferences` inline-citation card for the new Ask tool — both out of brief scope. |

**Note on #3:** this is the differentiated capability the whole PRD rests on (§25/§26 of the revised doc, §7/§19 of the audit). If you can only staff one workstream with your strongest agent/most review attention, it's this one. Everything else is comparatively low-risk UI work.

`AddPersonSheet` (workstream 2) is a dependency for workstream 1's contextual "add someone" moment (§22 of the PRD). Fastest path: workstream 2 defines and lands the component first (it's small), or both agents agree on a two-line prop interface up front and build against a stub — either avoids blocking. **What actually happened:** both agents ran in parallel and built against the stub interface independently, exactly as anticipated — but the two-prop contract evolved (#2's real component added an optional `onOpenChange`) in a way #1's already-merged call site couldn't know about. Merging #2 surfaced this as a real (if small) integration bug — dismissing the sheet without adding someone would leave "+ Add someone" silently disabled on next tap — fixed as part of conflict resolution at merge time (rewire the call site, not a scope violation by either agent). Worth remembering for Wave 2: a stub contract two parallel agents build against is a real seam, and needs a compile-time check (or at least a wiring smoke-test) at merge time, not just at each branch's own review.

---

## 4. Hot files — explicit contention notes

- **`src/app/(shell)/items/[id]/page.tsx`** — resolved by the Phase 0 split. Workstream 2 owns `item-ownership-section.tsx`, Workstream 3 owns `item-purchase-section.tsx`, Workstream 4 owns the already-existing `item-attachments.tsx` — none of them need to edit the parent page itself. Low collision risk even run fully in parallel.
- **`src/lib/ask/tools.ts`** — workstream 3 adds a purchase-info tool (or extends `findInventoryItems`); workstream 5 adds a pinned-location lookup tool. Both are additive keys on the same returned object literal — low risk if both agents are told explicitly "add a new key, do not reorder or refactor the file" — but if both fire in the same window, have workstream 3 land first (it's the priority workstream anyway) and workstream 5 rebase.
- **`src/app/capture/` and `src/app/scan/`** — appliance scanning (Wave 2, §5 below) and Universal Scan's narrowed launch (also Wave 2) both touch camera entry points. Not a Wave 1 concern, but flag now so Wave 2 sequencing accounts for it.

---

## 5. Wave 2 — parallel workstreams (fork after Wave 1's #2 and #3 merge)

| # | Workstream | PRD §§ | Depends on |
|---|---|---|---|
| 6 | **Finance-triggered capture nudge** | 26 | #3 (needs `item_purchases` + linking UI to deep-link into) |
| 7 | **Appliance scan + lifecycle** | 27 | #2 (ownership), #3 (warranty display via `item_purchases`) |
| 8 | **Universal Scan narrow launch** (2 modes: item, receipt) | 17, 32 | #7 for the appliance entry point to route around; otherwise light |

Workstream 6 follows the existing `send-due-bills` push job pattern — same directory (`src/app/api/v1/push/`), same shape (scheduled check → filter → send), different trigger condition (new transaction above a threshold/durable-goods category instead of a due date).

---

## 6. Explicit non-scope for every workstream

Every agent brief below should carry this line verbatim — it's the guardrail against scope creep re-entering through a side door:

> Do not build kitchen/food scanning, full home schematics/floor plans, a typed Home Systems taxonomy, document types beyond receipt/manual/warranty, or auto-classification beyond the two Universal Scan launch modes. If a task seems to require one of these, stop and flag it instead of building a minimal version.

---

## 7. Multi-agent orchestration strategy

**Why not maximum parallelism:** eight workstreams could in principle all fork at once, but three of them (Onboarding, Finance-linking, Appliances) touch shared UI surface or depend on another workstream's output. Forcing full parallelism just moves the cost from "sequential build time" to "merge conflict resolution time" — worse, because conflict resolution is harder to review than original code. The plan above front-loads the one shared dependency (item-detail componentization) into Phase 0 specifically so Wave 1 *can* run fully parallel without that cost.

**Recommended execution, using this session's `Agent` tool:**

1. **Phase 0 — run synchronously, foreground, one agent.** Small, high blast-radius if the migration is wrong (everything else depends on its column/table names), and worth watching directly rather than backgrounding. Review the migration and the item-detail split before merging to `develop`.
2. **Wave 1 — dispatch 5 agents with `isolation: "worktree"` and `run_in_background: true`** right after Phase 0 merges. Worktree isolation means they don't share a working directory, so even touching adjacent files carries no risk of one agent seeing another's uncommitted edits. Background means you keep working (or move straight to prepping Wave 2 briefs) while they run; each notifies on completion.
3. **Review each branch as it lands** — the `code-review` skill (`/code-review`) is available in this environment and is a fast way to get a second pass on each workstream before merging, especially workstream 3 given its importance.
4. **Merge order:** Documents and Home Map first (zero shared surface, safest to land), then Onboarding, then People/Ownership, then Finance-linking last — by the time it lands, the other three sections are already in place and it's the one most worth a careful, unhurried merge.
5. **Wave 2 — dispatch once #2 and #3 are merged**, same pattern (worktree + background).
6. **Integration pass** — after Wave 2, one pass (agent or you) that actually runs the app end to end — the `run` skill can launch and drive it — confirming the full loop: scan an item → link it to a transaction → ask "is this still under warranty" and get a real answer. That loop is the actual product bet; it's the one thing worth manually verifying rather than trusting to review alone.

**Agent type:** `general-purpose` for every implementation workstream (full tool access, no specialization needed here). Use `isolation: "worktree"` for every Wave 1/Wave 2 agent so parallel branches never collide on disk.

**Keep each brief narrow:** don't hand an agent the full 41-section PRD. Point it at this document's section for its workstream, the specific PRD §§ from `v4 - Enhanced Features`, and the file scope table above. A tight brief with explicit boundaries produces a reviewable diff; a broad one produces an agent that "helpfully" touches five files you didn't ask about.

---

## 8. Ready-to-dispatch briefs

Condensed prompts — paste into the `Agent` tool's `prompt` field, adjust the worktree/background flags per §7.

**Phase 0 — done.** Migration `0017_household_ledger_core.sql` is applied and verified against local Supabase; `src/components/item-ownership-section.tsx` and `src/components/item-purchase-section.tsx` (currently a no-op) are split out of `src/app/(shell)/items/[id]/page.tsx`. Wave 1 agents can branch now — no brief needed here anymore.

**Workstream 1 — Onboarding:**
> Implement Workstream 1 (`docs/Household Ledger Implementation Plan.md` §3) — rewrite `src/app/household-setup/page.tsx` per PRD `v4 - Enhanced Features` §11–§22: auto-created household/home, freeform space creation during first scan, no mandatory household-member step, contextual "+ Add someone" using the `AddPersonSheet` component from Workstream 2 (stub it with a two-prop interface — `{ open, onCreated }` — if Workstream 2 hasn't landed yet). Non-scope per §6 applies.

**Workstream 2 — People & ownership:**
> Implement Workstream 2 (`docs/Household Ledger Implementation Plan.md` §3) — generalize `src/app/(shell)/settings/members/` to cover both authenticated members and managed profiles (PRD §8, §23) against the `people` table from `0017_household_ledger_core.sql`, build the shared `AddPersonSheet` component, and fill in `src/components/item-ownership-section.tsx` (currently reads the legacy `ownerUserId`/`members` shape unchanged — migrate it to `owner_person_id`/`people`). Also migrate the ownership pickers in `src/app/add/page.tsx` and `src/app/items/[id]/edit/page.tsx` (both currently write `ownerUserId`) to the new schema. Non-scope per §6 applies.

**Workstream 3 — Finance ↔ item linking:**
> Implement Workstream 3 (`docs/Household Ledger Implementation Plan.md` §3) — the product's core differentiator. Fill in `src/components/item-purchase-section.tsx` (currently a no-op placeholder) to show linked purchase/warranty info via `item_purchases`; add a "link to item" affordance on transaction detail and the receipt-scan review flow; extend `src/lib/ask/tools.ts` with a purchase-info tool joining `item_purchases` → `transactions`/`scanned_receipt_line_items` (additive only — new key on the returned object, don't refactor the file). Follow PRD §25's stated approach: assisted/opportunistic matching with user confirmation, not automatic matching. Non-scope per §6 applies.

**Workstream 4 — Documents:**
> Implement Workstream 4 (`docs/Household Ledger Implementation Plan.md` §3) — audit `src/components/item-attachments.tsx` (already exists, already wired to the `attachments` table: kind receipt/manual/warranty) against PRD §28 and close any gaps in the upload/view flow. Do not add new attachment kinds. This is the smallest workstream — schema and the core component both already exist. Non-scope per §6 applies.

**Workstream 5 — Home Map:**
> Implement Workstream 5 (`docs/Household Ledger Implementation Plan.md` §3) — new Home Map route per PRD §29: pinned critical locations (water shutoff, panel, HVAC, network, plus renovation wall photos as one more location category) against the `pinned_locations` table from Phase 0. Simple records only — name, category, photo, note. No floor plans, no room geometry. Non-scope per §6 applies.

**Workstream 6 — Finance-triggered capture (Wave 2):**
> Implement Workstream 6 (`docs/Household Ledger Implementation Plan.md` §5) — the capture nudge from PRD §26, following the existing scheduled-push pattern in `src/app/api/v1/push/send-due-bills/`. Trigger on new transactions above a configurable threshold or from a durable-goods merchant category; the notification deep-links into a capture flow pre-linked to that transaction via Workstream 3's `item_purchases` schema. Non-scope per §6 applies.

**Workstream 7 — Appliances (Wave 2):**
> Implement Workstream 7 (`docs/Household Ledger Implementation Plan.md` §5) — appliance capture mode and lifecycle per PRD §27, using `items.extra_details` (already supports category-scoped fields) rather than a new table, and `src/lib/vision/detect.ts` for label OCR. Warranty display should read through Workstream 3's `item_purchases` linkage. Non-scope per §6 applies.

**Workstream 8 — Universal Scan launch (Wave 2):**
> Implement Workstream 8 (`docs/Household Ledger Implementation Plan.md` §5) — narrow Universal Scan per PRD §17/§32: two launch modes (item, receipt) at the existing camera entry points (`src/app/scan/`, `src/app/capture/`), with AI's best guess shown and one-tap correction rather than silent auto-routing. Route the appliance-label entry point (Workstream 7) as an explicit third option, not auto-classified. Non-scope per §6 applies — do not build classification for food, documents beyond receipt, or home systems.

---

## 9. Open items for Wave 1

- **Onboarding location-creation dead end — fixed.** A brand-new household (zero locations) hit an empty, pick-only `MoveSheet` with no way to add one — the exact gap PRD §14's "type a name, it gets created" was supposed to prevent, never actually wired into `src/app/capture/review/page.tsx`. Fixed once in `src/components/move-sheet.tsx` itself (every consumer benefits, not just capture/review): "+ New location" always visible, plus a "+ New container in `<name>`" per location, both reusing the existing `EntityFormSheet` and auto-selecting the new destination. Verified against the real running app with a genuinely empty household (real sign-in, real local DB, zero pre-existing locations), not just `tsc`/lint — screenshotted at each step, zero console errors. The companion gap — the post-scan "+ Add someone" moment, also flagged in Workstream 1's row above — is still open; it needs `AddPersonSheet` (Workstream 2) wired into `capture/review/page.tsx`, which no workstream's file scope covered.

- **`owner_user_id` deprecation timeline — still open, not closed by Wave 1.** 56 call sites across `src/` referenced `items.owner_user_id` before Wave 1; **re-grepped after Workstream 2 merged: 53 references remain across 16 files.** Workstream 2 was scoped to migrate the read/write call sites in `item-ownership-section.tsx`, `src/app/add/page.tsx`, and `src/app/items/[id]/edit/page.tsx` to `owner_person_id` — done, and both those write sites now set `ownerPersonId`/`ownerUserId` together explicitly (not left for the DB trigger to derive), since a managed profile's `linkedUserId` is null and a stale derived value could otherwise trip `0018_owner_sync.sql`'s consistency guard. The remaining 53 references are a mix of the documented compatibility shim itself (mappers, the trigger, type comments) and call sites genuinely outside Workstream 2's file scope — **re-grep again, and actually classify each remaining reference, before attempting to drop the column.** Drift risk stays closed regardless: `0018_owner_sync.sql`'s trigger still keeps both columns correct no matter which one any remaining call site writes.
- **Managed-profile-to-account conversion — still open, by design.** Workstream 2 treated this as a real, unresolved question rather than papering over it: `people.linked_user_id` stays exactly as Phase 0 defined it (nullable, set once, no other state), and "Invite to the app" deliberately does *not* pre-create a Person row ahead of acceptance — `accept_invite()` already creates its own Person row on acceptance, and today's schema has no column linking a pending invite back to a pre-created Person, so doing so here would produce a duplicate needing de-duplication later. The real fix is a schema change (e.g. `invites.target_person_id`) plus an explicit decision on what happens to a managed profile's history at conversion — flagged for a dedicated design pass, not something Wave 2 should improvise inside a UI component.

---

## 10. Remote deployment

**Status: done.** `0017_household_ledger_core.sql` and `0018_owner_sync.sql` were both verified locally first (§2, §9), then pushed to the linked production project via `supabase db push --linked` (dry-run confirmed before each push — exactly one pending migration each time, nothing unexpected). `supabase migration list` shows local and remote both at `0018`. Wave 1 agents can build against real production schema now.

---

## 11. Orchestration prompt — Wave 1

Self-contained — paste as the first message in a fresh Claude Code session at this repo (context from any prior conversation isn't assumed):

```
You are orchestrating Wave 1 of the Household Ledger build. Start by reading
docs/Household Ledger Implementation Plan.md in full, especially:

- §2 (Phase 0 — already complete: migrations 0017/0018 are applied to both
  local and production Supabase, item-detail is already split into
  item-ownership-section.tsx / item-purchase-section.tsx)
- §3 (Wave 1 workstreams and their file scope)
- §4 (hot-file contention notes)
- §6 (explicit non-scope — enforce this for every agent, verbatim)
- §7 (orchestration strategy)
- §8 (ready-to-dispatch briefs)

Then do the following:

1. Dispatch 5 agents with the Agent tool, one per Wave 1 workstream
   (Onboarding, People & ownership, Finance ↔ item linking, Documents,
   Home Map). For each: subagent_type "general-purpose", isolation
   "worktree", run_in_background true, and a prompt built from that
   workstream's brief in plan §8 plus the non-scope line from §6 verbatim.
   Tell each agent explicitly to commit to its own branch and NOT merge or
   push to develop itself.

2. Wait for completion notifications — don't poll manually.

3. Review each branch's diff before merging (use the /code-review skill,
   at minimum on Workstream 3 — Finance ↔ item linking — since plan §7
   flags it as the highest-priority, most-worth-careful-review branch).

4. Merge in this order (plan §7): Documents → Home Map → Onboarding →
   People & ownership → Finance ↔ item linking last.

5. After each merge, run `pnpm exec tsc --noEmit` and lint the changed
   files before merging the next branch — don't stack unverified merges.

6. If any agent's output touches files outside its §3/§4 scope, or
   conflicts with the §6 non-scope list, stop and flag it — don't merge it
   silently or "fix" it into compliance yourself.

7. Once all 5 are merged, run a full `pnpm exec tsc --noEmit`, update plan
   §3/§9 to reflect what actually shipped vs. the brief, and report a
   summary: what merged, what review found, any deviations.

8. Stop there. Do not dispatch Wave 2 (plan §5) — report Wave 1 complete
   and wait for explicit go-ahead first.
```

---

## 12. Orchestration prompt — Wave 2

Self-contained — paste as the first message in a fresh Claude Code session at this repo:

```
You are orchestrating Wave 2 of the Household Ledger build. Wave 1 is fully
merged to develop, plus two post-Wave-1 fixes: the MoveSheet location-
creation dead end (§9) and its plan-doc writeup. Start by reading
docs/Household Ledger Implementation Plan.md in full, especially:

- §3 (Wave 1 outcomes — what actually shipped vs. brief, useful context for
  what Wave 2 is building on top of)
- §5 (Wave 2 workstreams and their dependencies)
- §4 (hot-file contention notes — src/app/capture/ and src/app/scan/ are
  flagged there specifically for Wave 2)
- §6 (explicit non-scope — enforce this for every agent, verbatim)
- §8 (ready-to-dispatch briefs for Workstreams 6, 7, 8)
- §9 (open items — none are Wave 2's job, but be aware of them: the
  post-scan "+ Add someone" gap and the remaining owner_user_id references
  are both still open and out of scope here)

Then do the following:

1. Dispatch 2 agents in parallel with the Agent tool — Workstream 6
   (Finance-triggered capture nudge) and Workstream 7 (Appliance scan +
   lifecycle). For each: subagent_type "general-purpose", isolation
   "worktree", run_in_background true, and a prompt built from that
   workstream's brief in plan §8 plus the non-scope line from §6 verbatim.
   Tell each agent explicitly to commit to its own branch and NOT merge or
   push to develop itself.

   Do NOT dispatch Workstream 8 yet — plan §5 states it depends on #7 for
   the appliance entry point it needs to route around, and both #7 and #8
   touch camera entry points under src/app/capture/ and src/app/scan/
   (§4's hot-file note) — running them concurrently risks exactly the kind
   of collision Wave 1 avoided by sequencing instead of forcing parallelism.

2. Wait for #6 and #7 to complete — don't poll manually.

3. Review each branch's diff before merging (use the /code-review skill).

4. Merge order: Workstream 6 first (no shared surface with #7), then
   Workstream 7. Run `pnpm exec tsc --noEmit` and lint the changed files
   after each merge before proceeding.

5. Now dispatch Workstream 8 (Universal Scan narrow launch), same pattern
   (worktree + background), building against the now-merged Workstream 7.

6. Review, then merge Workstream 8. Run `pnpm exec tsc --noEmit` and lint
   again.

7. If any agent's output touches files outside its §5/§8 scope, or
   conflicts with the §6 non-scope list, stop and flag it — don't merge it
   silently or "fix" it into compliance yourself.

8. Once all 3 are merged, run a full `pnpm exec tsc --noEmit`, update plan
   §5/§9 to reflect what actually shipped vs. the brief (following the
   same honest-reporting shape §3 already used for Wave 1 — real gaps
   flagged, not papered over), and report a summary: what merged, what
   review found, any deviations.

9. Stop there. This is the last planned wave — don't invent new scope
   beyond §5 without checking in first.
```
