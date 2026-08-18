-- Shared 1:1 chat, read cursors, and a durable Web Push notification outbox.

begin;

create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

alter table public.profiles
  add column display_name text;

update public.profiles
set display_name = left(
  initcap(regexp_replace(split_part(email, '@', 1), '[._-]+', ' ', 'g')),
  60
)
where display_name is null;

alter table public.profiles
  alter column display_name set not null,
  add constraint profiles_display_name_length check (
    char_length(btrim(display_name)) between 1 and 60
    and display_name = btrim(display_name)
  );

create or replace function private.prepare_profile_display_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := coalesce(
    nullif(btrim(new.display_name), ''),
    left(
      initcap(regexp_replace(split_part(new.email, '@', 1), '[._-]+', ' ', 'g')),
      60
    )
  );
  return new;
end;
$$;

revoke all on function private.prepare_profile_display_name()
  from public, anon, authenticated;

create trigger profiles_prepare_display_name
before insert or update of display_name, email on public.profiles
for each row execute function private.prepare_profile_display_name();

-- Keep new allowlisted profiles usable without requiring a separate onboarding
-- transaction. Existing display names are intentionally not overwritten.
create or replace function private.sync_allowed_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_name text;
begin
  if lower(coalesce(new.email, '')) in (
    'cashpirowski@gmail.com',
    'renata.piorowska@gmail.com'
  ) then
    default_name := left(
      initcap(regexp_replace(split_part(new.email, '@', 1), '[._-]+', ' ', 'g')),
      60
    );

    insert into public.profiles (id, email, display_name)
    values (new.id, lower(new.email), default_name)
    on conflict (id) do update
      set email = excluded.email;
  else
    delete from public.profiles
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_allowed_profile() from public, anon, authenticated;

create table public.chat_messages (
  id uuid primary key,
  sequence bigint generated always as identity unique,
  sender_id uuid not null default auth.uid()
    references public.profiles (id) on update cascade on delete restrict,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_length check (
    char_length(body) between 1 and 2000
    and body = btrim(body)
  )
);

create index chat_messages_sequence_desc_idx
  on public.chat_messages (sequence desc);

create table public.chat_read_state (
  user_id uuid primary key
    references public.profiles (id) on update cascade on delete cascade,
  last_read_sequence bigint
    references public.chat_messages (sequence) on update cascade on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references public.profiles (id) on update cascade on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_not_blank check (btrim(endpoint) <> ''),
  constraint push_subscriptions_p256dh_not_blank check (btrim(p256dh) <> ''),
  constraint push_subscriptions_auth_not_blank check (btrim(auth) <> '')
);

create index push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id)
  where is_active;

create table public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  recipient_id uuid not null
    references public.profiles (id) on update cascade on delete cascade,
  actor_id uuid
    references public.profiles (id) on update cascade on delete set null,
  source_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint notification_events_type_not_blank check (btrim(event_type) <> ''),
  constraint notification_events_unique_source
    unique (event_type, recipient_id, source_id)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null
    references public.notification_events (id) on update cascade on delete cascade,
  subscription_id uuid not null
    references public.push_subscriptions (id) on update cascade on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  last_status_code integer,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_status check (
    status in ('pending', 'processing', 'retry', 'sent', 'dead')
  ),
  constraint notification_deliveries_attempts_nonnegative check (attempts >= 0),
  constraint notification_deliveries_unique_subscription
    unique (event_id, subscription_id)
);

create index notification_deliveries_due_idx
  on public.notification_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'retry', 'processing');

create or replace function private.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_id := auth.uid();
  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_chat_message() from public, anon, authenticated;

create trigger chat_messages_prepare
before insert on public.chat_messages
for each row execute function private.prepare_chat_message();

create or replace function private.prepare_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.user_id := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_push_subscription() from public, anon, authenticated;

create trigger push_subscriptions_prepare
before insert or update on public.push_subscriptions
for each row execute function private.prepare_push_subscription();

create trigger notification_deliveries_set_updated_at
before update on public.notification_deliveries
for each row execute function private.set_updated_at();

create or replace function private.enqueue_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  with inserted_events as (
    insert into public.notification_events (
      event_type,
      recipient_id,
      actor_id,
      source_id,
      payload
    )
    select
      'chat.message_created',
      profile.id,
      new.sender_id,
      new.id,
      jsonb_build_object('message_id', new.id)
    from public.profiles as profile
    where profile.id <> new.sender_id
    on conflict (event_type, recipient_id, source_id) do nothing
    returning id, recipient_id
  )
  insert into public.notification_deliveries (event_id, subscription_id)
  select event.id, subscription.id
  from inserted_events as event
  join public.push_subscriptions as subscription
    on subscription.user_id = event.recipient_id
   and subscription.is_active;

  return new;
end;
$$;

revoke all on function private.enqueue_chat_notification() from public, anon, authenticated;

create trigger chat_messages_enqueue_notification
after insert on public.chat_messages
for each row execute function private.enqueue_chat_notification();

create or replace function public.get_chat_unread_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_allowed_user() then 0::bigint
    else (
      select count(*)
      from public.chat_messages as message
      left join public.chat_read_state as read_state
        on read_state.user_id = auth.uid()
      where message.sender_id <> auth.uid()
        and message.sequence > coalesce(read_state.last_read_sequence, 0)
    )
  end;
$$;

revoke all on function public.get_chat_unread_count() from public, anon;
grant execute on function public.get_chat_unread_count() to authenticated;

create or replace function public.mark_chat_read(message_sequence bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_sequence bigint;
  unread_count bigint;
begin
  if not private.is_allowed_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select message.sequence
  into existing_sequence
  from public.chat_messages as message
  where message.sequence = message_sequence;

  if existing_sequence is null then
    raise exception 'Unknown chat message sequence' using errcode = '22023';
  end if;

  insert into public.chat_read_state (user_id, last_read_sequence)
  values (auth.uid(), existing_sequence)
  on conflict (user_id) do update
    set last_read_sequence = greatest(
      coalesce(public.chat_read_state.last_read_sequence, 0),
      excluded.last_read_sequence
    ),
    updated_at = now();

  select count(*)
  into unread_count
  from public.chat_messages as message
  join public.chat_read_state as read_state
    on read_state.user_id = auth.uid()
  where message.sender_id <> auth.uid()
    and message.sequence > coalesce(read_state.last_read_sequence, 0);

  return unread_count;
end;
$$;

revoke all on function public.mark_chat_read(bigint) from public, anon;
grant execute on function public.mark_chat_read(bigint) to authenticated;

-- This RPC is reachable only with a service-role key. It atomically leases
-- jobs so an immediate webhook and the retry cron cannot send duplicates.
create or replace function public.claim_notification_deliveries(batch_size integer default 50)
returns table (
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  event_type text,
  source_id uuid,
  recipient_id uuid,
  sender_name text,
  message_body text,
  attempt_number integer
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select delivery.id
    from public.notification_deliveries as delivery
    where (
      delivery.status in ('pending', 'retry')
      or (
        delivery.status = 'processing'
        and delivery.lease_until <= now()
      )
    )
      and delivery.next_attempt_at <= now()
      and delivery.attempts < 5
    order by delivery.created_at
    for update skip locked
    limit least(greatest(coalesce(batch_size, 50), 1), 50)
  ), claimed as (
    update public.notification_deliveries as delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        lease_until = now() + interval '2 minutes',
        updated_at = now()
    from due
    where delivery.id = due.id
    returning delivery.*
  )
  select
    claimed.id,
    subscription.id,
    subscription.endpoint,
    subscription.p256dh,
    subscription.auth,
    event.event_type,
    event.source_id,
    event.recipient_id,
    coalesce(actor.display_name, split_part(actor.email, '@', 1), 'List Up!'),
    message.body,
    claimed.attempts
  from claimed
  join public.notification_events as event on event.id = claimed.event_id
  join public.push_subscriptions as subscription
    on subscription.id = claimed.subscription_id
   and subscription.is_active
  left join public.profiles as actor on actor.id = event.actor_id
  left join public.chat_messages as message
    on event.event_type = 'chat.message_created'
   and message.id = event.source_id;
$$;

revoke all on function public.claim_notification_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

create or replace function private.dispatch_notification_request(body jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatch_url text;
  dispatch_secret text;
begin
  select decrypted_secret into dispatch_url
  from vault.decrypted_secrets
  where name = 'notification_dispatch_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into dispatch_secret
  from vault.decrypted_secrets
  where name = 'notification_webhook_secret'
  order by created_at desc
  limit 1;

  if dispatch_url is null or dispatch_secret is null then
    return;
  end if;

  perform net.http_post(
    url := dispatch_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Notification-Secret', dispatch_secret
    ),
    body := body,
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.dispatch_notification_request(jsonb)
  from public, anon, authenticated;

create or replace function private.dispatch_notification_event_webhook()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.dispatch_notification_request(
    jsonb_build_object('event_id', new.id)
  );
  return new;
end;
$$;

revoke all on function private.dispatch_notification_event_webhook()
  from public, anon, authenticated;

create trigger notification_events_dispatch_webhook
after insert on public.notification_events
for each row execute function private.dispatch_notification_event_webhook();

create or replace function private.dispatch_pending_notifications()
returns void
language sql
security definer
set search_path = ''
as $$
  select private.dispatch_notification_request('{"scheduled":true}'::jsonb);
$$;

create or replace function private.cleanup_notification_history()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.notification_events as event
  where event.created_at < now() - interval '30 days'
    and not exists (
      select 1
      from public.notification_deliveries as delivery
      where delivery.event_id = event.id
        and delivery.status not in ('sent', 'dead')
    );

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.dispatch_pending_notifications() from public, anon, authenticated;
revoke all on function private.cleanup_notification_history() from public, anon, authenticated;

alter table public.chat_messages enable row level security;
alter table public.chat_read_state enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

revoke all on table public.chat_messages from public, anon, authenticated;
revoke all on table public.chat_read_state from public, anon, authenticated;
revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.notification_events from public, anon, authenticated;
revoke all on table public.notification_deliveries from public, anon, authenticated;
revoke all on sequence public.chat_messages_sequence_seq
  from public, anon, authenticated;

grant select, insert on table public.chat_messages to authenticated;
grant usage, select on sequence public.chat_messages_sequence_seq to authenticated;
grant select on table public.chat_read_state to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select on table public.profiles to service_role;
grant select, delete on table public.chat_messages to service_role;
grant select, insert, update, delete on table public.chat_read_state to service_role;
grant select, delete on table public.notification_events to service_role;
grant select, update, delete on table public.push_subscriptions,
  public.notification_deliveries to service_role;

create policy chat_messages_select_allowed
on public.chat_messages for select to authenticated
using (private.is_allowed_user());

create policy chat_messages_insert_own
on public.chat_messages for insert to authenticated
with check (private.is_allowed_user() and sender_id = auth.uid());

create policy chat_read_state_select_own
on public.chat_read_state for select to authenticated
using (private.is_allowed_user() and user_id = auth.uid());

create policy push_subscriptions_select_own
on public.push_subscriptions for select to authenticated
using (private.is_allowed_user() and user_id = auth.uid());

create policy push_subscriptions_insert_own
on public.push_subscriptions for insert to authenticated
with check (private.is_allowed_user() and user_id = auth.uid());

create policy push_subscriptions_update_own
on public.push_subscriptions for update to authenticated
using (private.is_allowed_user() and user_id = auth.uid())
with check (private.is_allowed_user() and user_id = auth.uid());

create policy push_subscriptions_delete_own
on public.push_subscriptions for delete to authenticated
using (private.is_allowed_user() and user_id = auth.uid());

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_messages'
    ) then
      alter publication supabase_realtime add table public.chat_messages;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_read_state'
    ) then
      alter publication supabase_realtime add table public.chat_read_state;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'profiles'
    ) then
      alter publication supabase_realtime add table public.profiles;
    end if;
  end if;
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'dispatch-pending-notifications';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'dispatch-pending-notifications',
    '* * * * *',
    'select private.dispatch_pending_notifications();'
  );

  select jobid into existing_job_id
  from cron.job
  where jobname = 'cleanup-notification-history';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'cleanup-notification-history',
    '15 3 * * *',
    'select private.cleanup_notification_history();'
  );
end;
$$;

commit;
