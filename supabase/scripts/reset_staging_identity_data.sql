-- STAGING ONLY. This operation permanently removes cloned chat, read-state,
-- push-subscription, and notification-outbox data.
--
-- Preconditions:
--   1. 20260820120000_make_allowed_emails_configurable.sql is applied.
--   2. private.allowed_user_emails contains exactly the two new test emails.
--   3. The new Auth users have NOT been created yet.
--
-- The guard makes the script fail when the allowlist still matches an existing
-- Auth user, which is the normal production state.

begin;

do $$
declare
  allowed_count bigint;
  matching_auth_count bigint;
  existing_auth_count bigint;
  deleted_deliveries bigint;
  deleted_events bigint;
  deleted_subscriptions bigint;
  deleted_read_states bigint;
  deleted_messages bigint;
begin
  select count(*) into allowed_count
  from private.allowed_user_emails;

  if allowed_count <> 2 then
    raise exception
      'Expected exactly two staging allowlist entries, found %',
      allowed_count;
  end if;

  select count(*) into matching_auth_count
  from auth.users as auth_user
  join private.allowed_user_emails as allowed
    on allowed.email = lower(auth_user.email);

  if matching_auth_count <> 0 then
    raise exception
      'Safety check failed: % allowlisted email(s) already belong to Auth users',
      matching_auth_count;
  end if;

  select count(*) into existing_auth_count
  from auth.users;

  if existing_auth_count = 0 then
    raise exception 'Safety check failed: staging has no cloned Auth users';
  end if;

  delete from public.notification_deliveries;
  get diagnostics deleted_deliveries = row_count;

  delete from public.notification_events;
  get diagnostics deleted_events = row_count;

  delete from public.push_subscriptions;
  get diagnostics deleted_subscriptions = row_count;

  delete from public.chat_read_state;
  get diagnostics deleted_read_states = row_count;

  delete from public.chat_messages;
  get diagnostics deleted_messages = row_count;

  raise notice
    'Deleted: % deliveries, % events, % subscriptions, % read states, % messages',
    deleted_deliveries,
    deleted_events,
    deleted_subscriptions,
    deleted_read_states,
    deleted_messages;
end;
$$;

commit;

select
  (select count(*) from public.notification_deliveries) as deliveries,
  (select count(*) from public.notification_events) as events,
  (select count(*) from public.push_subscriptions) as subscriptions,
  (select count(*) from public.chat_read_state) as read_states,
  (select count(*) from public.chat_messages) as messages;
