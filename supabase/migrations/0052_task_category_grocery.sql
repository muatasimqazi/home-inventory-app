-- Adds a 'grocery' category to Household Tasks (0051_household_tasks.sql)
-- — a real, common recurring-task kind ("buy milk," "pick up prescription")
-- distinct enough from 'chore'/'other' to deserve its own icon/label
-- rather than being squeezed into one of the existing four.
alter table household_tasks drop constraint if exists household_tasks_category_check;
alter table household_tasks add constraint household_tasks_category_check
  check (category in ('maintenance', 'appointment', 'chore', 'grocery', 'other'));
