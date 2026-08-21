-- Real-time push notifications on household activity — Phase 1
-- (infrastructure only; no new activity-logging call sites, see the
-- approved plan for the full domain-by-domain Phase 2 backlog).
--
-- Every existing push job in this app (send-due-bills, send-capture-
-- nudges) is a Vercel-Cron-poll: check a table on a schedule, send. That
-- can't be "real-time" — cron granularity here is daily. Genuine real-
-- time requires a database-triggered webhook: the moment a row lands in
-- activity_log (src/lib/store.ts's logActivity(), ~50 call sites across
-- item/container/location/account/transaction/category/recurring_bill/
-- person/member actions), this fires an HTTP call to a new Next.js route
-- (src/app/api/v1/webhooks/activity-log/route.ts) which resolves the
-- household's members (including the actor — that's the explicit,
-- confirmed requirement, not an oversight), checks each one's
-- notification_preferences, and sends via the existing sendPushToUser()
-- (src/lib/push/send.ts, unchanged).
--
-- pg_net's net.http_post is async — queues the request and returns
-- immediately, so this doesn't add network latency to the activity_log
-- insert itself (which is already fire-and-forget from the client).
--
-- The webhook URL and shared secret live in Supabase Vault, not this
-- file: the URL differs per environment (local Postgres running in
-- Docker needs http://host.docker.internal:3000/..., production needs
-- the real domain) and a secret has no business in a git-tracked
-- migration. One-time setup per environment (run once, not part of this
-- migration):
--
--   select vault.create_secret('http://host.docker.internal:3000/api/v1/webhooks/activity-log', 'activity_notify_webhook_url');
--   select vault.create_secret('<same value as ACTIVITY_NOTIFY_WEBHOOK_SECRET env var>', 'activity_notify_webhook_secret');
--
-- (production: same two calls against the linked project, with the real
-- deployed URL). Until both secrets are set in a given environment, the
-- trigger function below no-ops rather than failing the insert — a fresh
-- unconfigured clone shouldn't have activity logging break.

create extension if not exists pg_net;
create extension if not exists supabase_vault;

create function activity_log_notify_webhook()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  webhook_url text;
  webhook_secret text;
begin
  select decrypted_secret into webhook_url
    from vault.decrypted_secrets where name = 'activity_notify_webhook_url';
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets where name = 'activity_notify_webhook_secret';

  if webhook_url is null or webhook_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || webhook_secret
    ),
    body := jsonb_build_object(
      'activityLogId', new.id,
      'householdId', new.household_id,
      'actorUserId', new.actor_user_id,
      'entityType', new.entity_type,
      'entityId', new.entity_id,
      'entityName', new.entity_name,
      'action', new.action,
      'detail', new.detail,
      'createdAt', new.created_at
    ),
    timeout_milliseconds := 5000
  );

  return new;
end;
$$;

create trigger activity_log_notify_after_insert
  after insert on activity_log
  for each row execute function activity_log_notify_webhook();
