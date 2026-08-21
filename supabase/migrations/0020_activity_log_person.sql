-- activity_log_entity_type_check (0001_init.sql, expanded once already by
-- 0010_finance_schema.sql for the finance domain) never got a matching
-- update when Workstream 2 (People & ownership UI) added logActivity()
-- calls with entityType: "person" (addPerson/updatePerson/deletePerson,
-- src/lib/store.ts) — every one of those inserts has been silently
-- rejected (400, "violates check constraint") ever since, caught only by
-- actually driving the real app rather than reviewing the diff (Household
-- Ledger Implementation Plan §9). Same drop/add pattern 0010 already used.

alter table activity_log drop constraint if exists activity_log_entity_type_check;
alter table activity_log add constraint activity_log_entity_type_check
  check (entity_type in (
    'item', 'container', 'location', 'household', 'member',
    'account', 'transaction', 'category', 'recurring_bill',
    'person'
  ));
