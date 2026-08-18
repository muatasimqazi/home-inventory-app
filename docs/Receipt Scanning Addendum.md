# Shohaz — Receipt Scanning Addendum

Companion to the [Personal Finance PRD](Personal%20Finance%20PRD.md) and [Personal Finance Addendum](Personal%20Finance%20Addendum.md). This document scopes AI-assisted receipt/statement scanning: photograph a receipt (or a stack of receipts, or a statement), get transactions auto-populated into an existing category, review, confirm.

**This deliberately reopens three things the Finance PRD explicitly deferred to Phase 2**: receipt attachments — including *permanent* retention, per §6 (§15/§28), AI features generally (§5), and, in spirit though not in the end adopted, split transactions (§15 — considered in §2, declined). Naming that plainly rather than building past it quietly — the justification isn't "it'd be nice," it's that Shohaz already has a proven, working version of exactly this shape (photo → AI vision detection → mandatory human review → save) for inventory, and re-deriving that infrastructure from scratch later would waste what's already built and battle-tested. Reopening it now, deliberately, while the reasoning is fresh, is cheaper than reopening it cold in six months.

## 1. What this reuses — the actual justification for reopening deferred scope

- **`VisionProvider` (`src/lib/ai.ts`)** — extended with a new method, not replaced or duplicated. The existing `detectItems(photos): Promise<DetectedItem[]>` pattern (confidence scoring, `REVIEW_THRESHOLD = 0.75`, `needsReview`/`reviewReason`, per-item `boundingBox` for crop-to-region, `MockVisionProvider` standing in until credentials exist) is structurally exactly what receipt extraction needs — different fields, same shape, same reliability engineering (AI Gateway routing, bounded timeouts, fallback model, disabled default reasoning for latency) already paid for.
- **Mandatory human review** — the same non-negotiable Shohaz already applies to every AI-detected item applies here: nothing posts as a real transaction without a review step, exactly like `AIReviewForm`/`BulkReviewList` for inventory.
- **`category_rules`** (Finance PRD §16, already in the schema) — a scanned merchant matching an existing rule resolves instantly and confidently; one that doesn't falls back to the AI's own category guess, subject to the same review threshold. Correcting a scanned category and saving it as a rule is the exact same "learned" mechanism inventory's `normalization_rules` already has (PRD §22, "the learning half... ships as soon as the foundation is stable") — not a new concept, the second real use of one already-proven pattern.
- **CSV import's guided-wizard shape** (Finance PRD §20) — upload → parse → review flagged/low-confidence rows → confirm is the same shape a scan pipeline needs, just with AI vision doing the parsing step instead of column-mapping.
- **CSV import's duplicate-detection heuristic** (same account + date ± N days + amount + normalized description similarity, Finance PRD §30/§32) — reused verbatim. A scanned receipt for a purchase already present via CSV import or manual entry must be caught, not silently duplicated.

## 2. Two scan modes — and the ledger question resolved

**Single receipt → one transaction, with full line-item detail underneath — resolved 2026-08-17.** A grocery or Costco receipt's total is *one* charge on *one* account, matching how the actual ledger works (PRD Principle 1, "financial correctness over visual cleverness") and how it'll reconcile against a CSV-imported statement later without double-counting. This was the open question in the first draft of this document; **every item is still fully captured** — every field in §4's extraction schema (raw name, standardized name, brand, category/subcategory guess, quantity, unit price, line total, confidence) is stored as structured, queryable detail on that one transaction, not discarded. What's explicitly **not** happening: the receipt does not get split into multiple *ledger* transactions by category — that's "split transactions," a distinct thing the Finance PRD already lists as an MVP non-goal (§15), and reopening it was considered and declined here in favor of the reconciliation guarantee.

**Statement / multiple receipts → many transactions, bulk review.** A credit card statement, or a photographed stack of receipts, legitimately contains multiple distinct *charges* (not to be confused with one receipt's multiple *items*). This is where the multi-item precedent (inventory's "multi-item detection is in MVP," PRD §12, and the `BulkReviewList` component) applies — one scan batch produces N receipt/transaction candidates, each with its own full item list per the schema above, reviewed as a scannable, editable, removable list, not N single-review screens in sequence.

## 3. Data model additions

```sql
receipt_scan_batches (
  id, household_id,
  source_image_paths,  -- text[], Storage paths — one or more photos/pages in one scan session
  status,               -- 'processing' | 'ready_for_review' | 'confirmed' | 'failed'
  detected_count, confirmed_count,
  created_by_user_id, created_at, updated_at
)

-- One row per candidate transaction (= one receipt's total) the scan
-- produced, whether from a single-receipt scan (row count 1) or a
-- statement scan (row count N). Confirmed rows become real `transactions`
-- rows (Personal Finance Addendum §14); this table is the review-stage
-- holding area, matching how csv_import_batches relates to the
-- transactions it eventually creates.
scanned_transaction_drafts (
  id, household_id, batch_id,
  store,                          -- receipt-level, from the extraction schema (§4)
  suggested_date,
  subtotal_cents, tax_cents, suggested_amount_cents,  -- suggested_amount_cents = the schema's "total"
  suggested_category_id,          -- nullable; resolved via category_rules match, else AI guess — see §5
  category_source,                -- 'rule_match' | 'ai_suggestion' | 'user_corrected'
  confidence,                     -- 0-1, receipt-level confidence
  needs_review, review_reason,
  bounding_box,                   -- jsonb {x,y,width,height}, same normalized-0-1 shape as DetectedItem
  photo_index,                    -- which image in source_image_paths this receipt was found on
  status,                         -- 'pending' | 'confirmed' | 'dismissed'
  resulting_transaction_id,       -- set once confirmed
  account_id                      -- nullable until the user picks one during review — see §6
)

-- Full per-item detail, one row per item on a receipt. Lives through both
-- stages: during review it's linked only to draft_id; at confirmation,
-- transaction_id gets set too (in addition to draft_id, not replacing it) so
-- the detail persists as permanent, queryable structure on the resulting
-- transaction rather than being discarded once the draft's job is done.
scanned_receipt_line_items (
  id, household_id, draft_id,
  transaction_id,                 -- nullable until the parent draft is confirmed
  raw_item, standard_name, brand, -- exactly per §4's schema
  category_guess_id,              -- nullable; resolved same as §5, but per item
  subcategory_guess_id,           -- nullable; resolved if it matches an existing subcategory
  subcategory_guess_text,         -- the AI's raw guess, kept even if it didn't resolve to a real subcategory
  quantity, unit_price_cents, line_total_cents,
  confidence
)
```

No new RLS pattern — same household-scoped `EXISTS` check as everything else. Line items are informational/structured detail, not separate ledger rows — they never get their own `household_id`-scoped financial-total semantics beyond what's already summed into the parent transaction's `amount_cents`.

## 4. AI/vision pipeline extension

**The extraction prompt is adopted verbatim from an already-proven iOS Shortcuts flow doing this exact task today** — not redesigned from scratch. Reusing a working prompt is worth more than a theoretically-cleaner one written cold:

```
Extract this receipt into JSON only.

Return exactly this structure:

{
  "store": "",
  "date": "",
  "subtotal": 0,
  "tax": 0,
  "total": 0,
  "items": [
    {
      "raw_item": "",
      "standard_name": "",
      "brand": "",
      "category_guess": "",
      "subcategory_guess": "",
      "quantity": 1,
      "unit_price": 0,
      "line_total": 0,
      "confidence": 0
    }
  ]
}

Rules:
- raw_item must be exactly what appears on the receipt.
- standard_name should be the most likely full product name.
- Expand common Costco abbreviations when confident.
- If unsure, use raw_item as standard_name.
- Return JSON only.
- Do not use markdown.
- Do not include explanations.

Receipt text
```

The LLM's raw output stays exactly this snake_case shape — don't ask the model to output camelCase or anything else that deviates from what's proven. The TypeScript layer maps it on the way in:

```ts
// Raw shape the prompt above produces — one per receipt.
interface ReceiptExtraction {
  store: string;
  date: string;             // ISO date, extracted
  subtotal: number;         // dollars as given by the model; converted to *_cents at the DB boundary
  tax: number;
  total: number;
  items: ReceiptLineItemExtraction[];
}
interface ReceiptLineItemExtraction {
  raw_item: string;
  standard_name: string;
  brand: string;
  category_guess: string;
  subcategory_guess: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  confidence: number;       // 0-1 — same REVIEW_THRESHOLD = 0.75 applies, now per item too
}

// Extends the existing VisionProvider interface — same provider, second
// method. Array because one scan batch (a statement, a stack of receipts)
// can contain multiple receipts, each with its own item list — see §2.
interface VisionProvider {
  detectItems(photos: string[]): Promise<DetectedItem[]>;              // existing, unchanged
  extractReceipts(photos: string[]): Promise<ReceiptExtraction[]>;     // new
}
```

**Confidence and review now apply at two levels.** A receipt can be high-confidence overall (clean store/date/total) while individual items are low-confidence (a smudged line, an ambiguous abbreviation) — both the parent draft and each `scanned_receipt_line_item` carry their own `confidence`/needs-review state, so a review screen can flag "this one item" without forcing a full re-review of an otherwise-clean receipt.

**One real difference from item detection, not a copy-paste:** `DetectedItem`'s quantity-grouping ("3 identical pens → one entry with quantity 3") does **not** transfer to *transactions* (§2) — three separate Starbucks charges on a statement stay three distinct transactions. It *does* still make sense at the *line-item* level within one receipt, exactly as the schema already models it (`quantity` + `unit_price` + `line_total` per item) — "3 identical pens" on one Costco receipt is one line item with quantity 3, same as inventory.

## 5. Category resolution order

Applies twice — once for the transaction's own category (driven by merchant), and once per line item (driven by `category_guess`/`subcategory_guess`), same order both times:

1. Matches an existing `category_rules` row (merchant, for the transaction; item name/brand, for a line item) → apply directly, `category_source: 'rule_match'`, high effective confidence (a rule is a stronger signal than a fresh AI guess).
2. No rule match → the AI's own guess, `category_source: 'ai_suggestion'`, subject to `REVIEW_THRESHOLD`.
3. User corrects a category during review → offer "always categorize [merchant/item] as [category]" (writes a new `category_rules` row, `source: 'learned'`) — identical mechanism to inventory's normalization-rule learning, not a new pattern to design.

This is the concrete payoff of resolving "bucket" as "existing category" rather than a new concept: the whole resolution path was already half-built for a different domain, and it turned out to generalize cleanly to the line-item level too.

## 6. Open questions — two resolved 2026-08-17, two still open

### Resolved: which account pays → match the card's last 4 digits

**A third Finance PRD non-goal gets reopened here, worth naming like the other two**: §1's "receipt attachments" deferral was specifically about *permanent, browsable-later* attachments — this resolution means receipts *are* now retained permanently, not just held for the review session. Three deliberate reversals now stand on this one feature (receipts+AI, generally; declined-but-considered split transactions; permanent attachments) — each reasoned individually, not a slippery slope, but worth seeing listed together once.

**Extraction schema gains a field beyond the original proven prompt** — the source prompt (§4) doesn't ask for card info, so this is a deliberate addition, not something smuggled into what was already proven:

```
Add to the JSON structure, at the top level alongside "store"/"date"/etc.:
  "card_last_four": ""   // last 4 digits printed on the receipt, empty string if not present/legible
```

```ts
interface ReceiptExtraction {
  // ...existing fields...
  card_last_four: string;  // may be empty — not every receipt prints it
}
```

**`accounts` gains a column** (Personal Finance Addendum §14 — that table isn't built yet, so this is a free edit to the spec, not a migration on a live table):

```sql
alter table accounts add column card_last_four text;  -- nullable; credit_card/debit-bearing types only
```

**Resolution logic**, run once per scanned receipt: look up the household's `accounts` where `card_last_four` matches the extracted value.
- Exactly one match → auto-assign `account_id` on the draft, high confidence, no review friction.
- Zero matches (not printed, illegible, or a card not yet added as an account) → `account_id` stays null, user picks during review — the manual fallback isn't removed, it's just the exception path now instead of the default.
- More than one match (two cards coincidentally sharing a last-4, rare but real) → flag `needs_review` explicitly with that as the reason, don't silently guess between them.

This resolves the "ask once per batch vs. per-row vs. infer" question from the first draft in favor of a fourth option none of those anticipated: don't ask at all when the receipt already tells you, and this is exactly the kind of detail visible in the receipt image itself, unlike merchant-category matching which needs a rule or an AI guess.

### Resolved: receipt image retention → permanent, linked to the transaction

Reverses the first draft's "review-session-only" default. Storage mechanism, and the one real architectural decision this raises:

**Recommendation: a new, dedicated `transaction_attachments` table (kind always `'receipt'` for now) — not a generalization of the existing `attachments` table.** The Platform Foundation Addendum's polymorphic-link convention (`linked_entity_type`/`linked_entity_id`) was written with exactly this kind of case in mind, and generalizing `attachments` to use it *is* the architecturally cleaner long-term answer — but `attachments` is a real, already-shipped, in-production table backing inventory's item attachments today. Migrating its shape (adding `entity_type`/`entity_id`, backfilling every existing row with `entity_type='item'`, updating every call site that reads `attachments.item_id`) is a materially bigger and riskier change than anything else in this whole design pass, all of which has been purely additive. Matching the same "prove it twice, then generalize" discipline already applied to `RecurringBill`/`household_tasks` (Household Hub Addendum §2): ship the dedicated table now, revisit unifying it with `attachments` once there's a second real non-inventory consumer, not on the strength of one.

```sql
transaction_attachments (
  id, household_id, transaction_id,
  storage_path,        -- same Storage bucket pattern as item attachments
  content_type, size_bytes,
  source_draft_id,      -- nullable, references scanned_transaction_drafts.id — the *specific receipt*
                         -- this image came from, not the batch. A bulk statement scan can produce
                         -- several transactions from one batch; pointing at the batch would lose
                         -- which of the batch's several source images belongs to which transaction.
                         -- Null for a manually-attached receipt added later, outside this feature.
  created_by_user_id, created_at
)
```

**Corrected 2026-08-18** — this column was originally named/referenced `source_scan_batch_id` (the batch, not the individual receipt within it), a real bug caught during the pre-implementation audit: a multi-receipt scan batch produces several transactions, and linking an attachment to the whole batch rather than its own draft would make it impossible to tell which source image belongs to which transaction. Fixed to reference `scanned_transaction_drafts.id` instead — each draft already knows its own `photo_index` into the batch's `source_image_paths`, so this is still one hop from the original image, just through the correct row.

Flagging the dedicated-table-vs-generalized-`attachments` choice above as a considered call, not a silent default — say so if the generalized version is actually preferred despite the migration cost.

### Still open

- **Statement format support.** Photo/image input only (matching Shohaz's real `getUserMedia` capture flow) — PDF statement parsing remains a distinct, larger, unscoped feature.
- **Backdating**, i.e. "attribute this to a given month": already covered by `occurred_at` being a normal, user-editable field during review — no new schema needed.

## 7. Explicit non-goals, still held

**Line-item *capture* and receipt *retention* are now both fully in scope (§3/§4/§6) — what's still explicitly out of scope is line-item *ledger splitting* and downstream *reporting built on top of the captured detail*:** no per-category budgeting or itemized tax/expense reports driven by `scanned_receipt_line_items` (the data exists and is queryable; building analytics on it is separate, future work, not implied by capturing it now). No PDF statement parsing. No bank-sync-adjacent auto-import (Plaid remains explicitly out of scope, Finance PRD §5/§28) — this stays purely photo-in, human-reviewed-out, same trust model as inventory's capture flow.
