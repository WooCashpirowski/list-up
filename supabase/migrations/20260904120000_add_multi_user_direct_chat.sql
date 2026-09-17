-- Expand the private app from one global two-person chat to isolated direct
-- conversations between any number of administrator-provisioned users.

begin;

-- Membership is keyed by the immutable Auth user id. The table is maintained
-- only by the auth.users trigger; it is never exposed through the Data API.
create table private.app_users (
  user_id uuid primary key
    references auth.users (id) on update cascade on delete cascade,
  created_at timestamptz not null default now()
);

revoke all on table private.app_users from public, anon, authenticated;

insert into private.app_users (user_id)
select auth_user.id
from auth.users as auth_user
join private.allowed_user_emails as allowed
  on allowed.email = lower(auth_user.email)
join public.profiles as profile
  on profile.id = auth_user.id
where auth_user.email_confirmed_at is not null
on conflict (user_id) do nothing;

create or replace function private.is_app_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.app_users as app_user
    join auth.users as auth_user on auth_user.id = app_user.user_id
    join public.profiles as profile on profile.id = app_user.user_id
    where app_user.user_id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and lower(profile.email) = lower(auth_user.email)
  );
$$;

revoke all on function private.is_app_user() from public, anon, authenticated;
grant execute on function private.is_app_user() to authenticated;

create or replace function private.is_active_app_user(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from private.app_users as app_user
    where app_user.user_id = target_user_id
  );
$$;

revoke all on function private.is_active_app_user(uuid)
  from public, anon, authenticated;
grant execute on function private.is_active_app_user(uuid) to authenticated;

-- Keep the old helper as a compatibility shim for existing policies and any
-- client that is still running the previous PWA bundle during deployment.
create or replace function private.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_app_user();
$$;

revoke all on function private.is_allowed_user() from public, anon, authenticated;
grant execute on function private.is_allowed_user() to authenticated;

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  first_user_id uuid not null
    references public.profiles (id) on update cascade on delete restrict,
  second_user_id uuid not null
    references public.profiles (id) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  constraint chat_conversations_canonical_pair check (
    first_user_id < second_user_id
  ),
  constraint chat_conversations_unique_pair unique (
    first_user_id,
    second_user_id
  )
);

create index chat_conversations_second_user_idx
  on public.chat_conversations (second_user_id);

-- Existing members receive one conversation for every pair. The current
-- production data has one pair, while this also supports an empty chat on a
-- staging database that already contains more members.
insert into public.chat_conversations (first_user_id, second_user_id)
select first_member.user_id, second_member.user_id
from private.app_users as first_member
join private.app_users as second_member
  on first_member.user_id < second_member.user_id
join public.profiles as first_profile on first_profile.id = first_member.user_id
join public.profiles as second_profile on second_profile.id = second_member.user_id
on conflict (first_user_id, second_user_id) do nothing;

alter table public.chat_messages
  add column conversation_id uuid;

do $$
declare
  member_count bigint;
  legacy_conversation_id uuid;
begin
  if exists (select 1 from public.chat_messages) then
    select count(*) into member_count from private.app_users;

    if member_count <> 2 then
      raise exception
        'Cannot migrate legacy chat: expected exactly two active app users, found %',
        member_count;
    end if;

    if exists (
      select 1
      from public.chat_messages as message
      where not exists (
        select 1
        from private.app_users as member
        where member.user_id = message.sender_id
      )
    ) then
      raise exception 'Cannot migrate legacy chat: a sender is not an active app user';
    end if;

    select conversation.id into legacy_conversation_id
    from public.chat_conversations as conversation
    join private.app_users as first_member
      on first_member.user_id = conversation.first_user_id
    join private.app_users as second_member
      on second_member.user_id = conversation.second_user_id
    limit 1;

    if legacy_conversation_id is null then
      raise exception 'Cannot migrate legacy chat: direct conversation is missing';
    end if;

    update public.chat_messages
    set conversation_id = legacy_conversation_id;
  end if;
end;
$$;

alter table public.chat_messages
  alter column conversation_id set not null,
  add constraint chat_messages_conversation_id_fkey
    foreign key (conversation_id)
    references public.chat_conversations (id)
    on update cascade on delete restrict,
  add constraint chat_messages_conversation_sequence_key
    unique (conversation_id, sequence);

drop index if exists public.chat_messages_sequence_desc_idx;
create index chat_messages_conversation_sequence_desc_idx
  on public.chat_messages (conversation_id, sequence desc);

alter table public.chat_read_state
  add column conversation_id uuid;

update public.chat_read_state as read_state
set conversation_id = message.conversation_id
from public.chat_messages as message
where message.sequence = coalesce(
  read_state.last_read_sequence,
  read_state.last_delivered_sequence
);

-- A user may have opened the old chat before any message existed. Resolve that
-- sole legacy conversation independently of a cursor in that case.
update public.chat_read_state as read_state
set conversation_id = conversation.id
from public.chat_conversations as conversation
where read_state.conversation_id is null
  and (
    read_state.user_id = conversation.first_user_id
    or read_state.user_id = conversation.second_user_id
  )
  and 1 = (
    select count(*)
    from public.chat_conversations as candidate
    where read_state.user_id = candidate.first_user_id
       or read_state.user_id = candidate.second_user_id
  );

do $$
begin
  if exists (
    select 1 from public.chat_read_state where conversation_id is null
  ) then
    raise exception 'Cannot migrate legacy chat read state to a conversation';
  end if;
end;
$$;

alter table public.chat_read_state
  drop constraint chat_read_state_pkey,
  drop constraint chat_read_state_last_delivered_sequence_fkey,
  drop constraint chat_read_state_last_read_sequence_fkey,
  alter column conversation_id set not null,
  add constraint chat_read_state_pkey primary key (conversation_id, user_id),
  add constraint chat_read_state_conversation_id_fkey
    foreign key (conversation_id)
    references public.chat_conversations (id)
    on update cascade on delete restrict,
  add constraint chat_read_state_last_delivered_message_fkey
    foreign key (conversation_id, last_delivered_sequence)
    references public.chat_messages (conversation_id, sequence)
    on update cascade on delete restrict,
  add constraint chat_read_state_last_read_message_fkey
    foreign key (conversation_id, last_read_sequence)
    references public.chat_messages (conversation_id, sequence)
    on update cascade on delete restrict;

create index chat_read_state_user_idx
  on public.chat_read_state (user_id);

create or replace function private.validate_chat_read_state_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.chat_conversations as conversation
    where conversation.id = new.conversation_id
      and (
        new.user_id = conversation.first_user_id
        or new.user_id = conversation.second_user_id
      )
  ) then
    raise exception 'Chat read state user is not a conversation participant'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_chat_read_state_participant()
  from public, anon, authenticated;

create trigger chat_read_state_validate_participant
before insert or update of conversation_id, user_id on public.chat_read_state
for each row execute function private.validate_chat_read_state_participant();

create or replace function private.broadcast_chat_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'user_id', new.user_id,
      'kind', case
        when new.last_read_sequence is distinct from old.last_read_sequence
          then 'read'
        else 'delivered'
      end,
      'sequence', coalesce(
        new.last_read_sequence,
        new.last_delivered_sequence,
        0
      )
    ),
    'receipt',
    'list-up:chat:' || new.conversation_id::text || ':live',
    true
  );

  return new;
end;
$$;

revoke all on function private.broadcast_chat_receipt()
  from public, anon, authenticated;

create trigger chat_read_state_broadcast_receipt
after update of last_delivered_sequence, last_read_sequence
on public.chat_read_state
for each row
when (
  new.last_delivered_sequence is not null
  and (
    old.last_delivered_sequence is distinct from new.last_delivered_sequence
    or old.last_read_sequence is distinct from new.last_read_sequence
  )
)
execute function private.broadcast_chat_receipt();

insert into public.chat_read_state (conversation_id, user_id)
select conversation.id, participant.user_id
from public.chat_conversations as conversation
cross join lateral (
  values (conversation.first_user_id), (conversation.second_user_id)
) as participant(user_id)
on conflict (conversation_id, user_id) do nothing;

create or replace function private.initialize_chat_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_read_state (conversation_id, user_id)
  values
    (new.id, new.first_user_id),
    (new.id, new.second_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.initialize_chat_conversation()
  from public, anon, authenticated;

create trigger chat_conversations_initialize
after insert on public.chat_conversations
for each row execute function private.initialize_chat_conversation();

create or replace function private.ensure_direct_conversations(new_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.chat_conversations (first_user_id, second_user_id)
  select
    least(new_user_id, member.user_id),
    greatest(new_user_id, member.user_id)
  from private.app_users as member
  join public.profiles as profile on profile.id = member.user_id
  where member.user_id <> new_user_id
  on conflict (first_user_id, second_user_id) do nothing;
$$;

revoke all on function private.ensure_direct_conversations(uuid)
  from public, anon, authenticated;

drop trigger if exists auth_users_sync_allowed_profile on auth.users;

create or replace function private.sync_app_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_name text;
  should_activate boolean;
begin
  if new.email is null or new.email_confirmed_at is null then
    delete from private.app_users where user_id = new.id;
    return new;
  end if;

  if tg_op = 'INSERT' then
    should_activate := true;
  else
    should_activate := exists (
      select 1 from private.app_users as app_user where app_user.user_id = new.id
    ) or old.email_confirmed_at is null;
  end if;

  if should_activate then
    insert into private.app_users (user_id)
    values (new.id)
    on conflict (user_id) do nothing;

    default_name := left(
      initcap(regexp_replace(split_part(new.email, '@', 1), '[._-]+', ' ', 'g')),
      60
    );

    insert into public.profiles (id, email, display_name)
    values (new.id, lower(new.email), default_name)
    on conflict (id) do update set email = excluded.email;

    perform private.ensure_direct_conversations(new.id);
  end if;

  return new;
end;
$$;

revoke all on function private.sync_app_user() from public, anon, authenticated;

create trigger auth_users_sync_app_user
after insert or update of email, email_confirmed_at on auth.users
for each row execute function private.sync_app_user();

drop function if exists private.sync_allowed_profile();

-- Message ownership and conversation membership are always determined by the
-- authenticated user. The null branch accepts a queued message created by the
-- old two-person PWA only while the sender has exactly one conversation.
create or replace function private.prepare_chat_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_conversation_id uuid;
  conversation_count bigint;
begin
  new.sender_id := auth.uid();

  if new.conversation_id is null then
    select count(*), (array_agg(conversation.id order by conversation.id))[1]
    into conversation_count, resolved_conversation_id
    from public.chat_conversations as conversation
    where auth.uid() = conversation.first_user_id
       or auth.uid() = conversation.second_user_id;

    if conversation_count <> 1 then
      raise exception 'A conversation id is required'
        using errcode = '22023';
    end if;

    new.conversation_id := resolved_conversation_id;
  end if;

  if not private.is_app_user() or not exists (
    select 1
    from public.chat_conversations as conversation
    where conversation.id = new.conversation_id
      and (
        auth.uid() = conversation.first_user_id
        or auth.uid() = conversation.second_user_id
      )
  ) then
    raise exception 'Not authorized for this conversation'
      using errcode = '42501';
  end if;

  new.body := btrim(new.body);
  new.created_at := now();
  return new;
end;
$$;

drop policy if exists profiles_select_allowed on public.profiles;
create policy profiles_select_app_users
on public.profiles for select to authenticated
using (
  private.is_app_user()
  and private.is_active_app_user(profiles.id)
);

alter table public.chat_conversations enable row level security;
revoke all on table public.chat_conversations from public, anon, authenticated;
grant select on table public.chat_conversations to authenticated;
grant select, insert, update, delete on table public.chat_conversations to service_role;

create policy chat_conversations_select_participant
on public.chat_conversations for select to authenticated
using (
  private.is_app_user()
  and (
    auth.uid() = first_user_id
    or auth.uid() = second_user_id
  )
);

drop policy if exists chat_messages_select_allowed on public.chat_messages;
drop policy if exists chat_messages_insert_own on public.chat_messages;

create policy chat_messages_select_participant
on public.chat_messages for select to authenticated
using (
  private.is_app_user()
  and exists (
    select 1
    from public.chat_conversations as conversation
    where conversation.id = chat_messages.conversation_id
      and (
        auth.uid() = conversation.first_user_id
        or auth.uid() = conversation.second_user_id
      )
  )
);

create policy chat_messages_insert_participant
on public.chat_messages for insert to authenticated
with check (
  private.is_app_user()
  and sender_id = auth.uid()
  and exists (
    select 1
    from public.chat_conversations as conversation
    where conversation.id = chat_messages.conversation_id
      and (
        auth.uid() = conversation.first_user_id
        or auth.uid() = conversation.second_user_id
      )
  )
);

drop policy if exists chat_read_state_select_own on public.chat_read_state;
create policy chat_read_state_select_own
on public.chat_read_state for select to authenticated
using (
  private.is_app_user()
  and user_id = auth.uid()
);

create or replace function public.get_chat_inbox()
returns table (
  conversation_id uuid,
  peer_id uuid,
  peer_email text,
  peer_display_name text,
  last_message_id uuid,
  last_message_sender_id uuid,
  last_message_body text,
  last_message_sequence bigint,
  last_message_created_at timestamptz,
  last_incoming_sequence bigint,
  unread_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    conversation.id,
    peer.id,
    peer.email,
    peer.display_name,
    latest.id,
    latest.sender_id,
    latest.body,
    latest.sequence,
    latest.created_at,
    (
      select max(incoming.sequence)
      from public.chat_messages as incoming
      where incoming.conversation_id = conversation.id
        and incoming.sender_id <> auth.uid()
    ),
    (
      select count(*)
      from public.chat_messages as unread
      where unread.conversation_id = conversation.id
        and unread.sender_id <> auth.uid()
        and unread.sequence > coalesce(read_state.last_read_sequence, 0)
    )
  from public.chat_conversations as conversation
  join public.profiles as peer
    on peer.id = case
      when conversation.first_user_id = auth.uid()
        then conversation.second_user_id
      else conversation.first_user_id
    end
  join private.app_users as peer_membership on peer_membership.user_id = peer.id
  left join public.chat_read_state as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = auth.uid()
  left join lateral (
    select message.*
    from public.chat_messages as message
    where message.conversation_id = conversation.id
    order by message.sequence desc
    limit 1
  ) as latest on true
  where auth.uid() = conversation.first_user_id
     or auth.uid() = conversation.second_user_id
  order by latest.sequence desc nulls last, lower(peer.display_name), lower(peer.email);
end;
$$;

revoke all on function public.get_chat_inbox() from public, anon;
grant execute on function public.get_chat_inbox() to authenticated;

create or replace function public.get_chat_unread_count()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not private.is_app_user() then 0::bigint
    else (
      select count(*)
      from public.chat_messages as message
      join public.chat_conversations as conversation
        on conversation.id = message.conversation_id
      left join public.chat_read_state as read_state
        on read_state.conversation_id = message.conversation_id
       and read_state.user_id = auth.uid()
      where message.sender_id <> auth.uid()
        and (
          auth.uid() = conversation.first_user_id
          or auth.uid() = conversation.second_user_id
        )
        and message.sequence > coalesce(read_state.last_read_sequence, 0)
    )
  end;
$$;

create or replace function public.mark_chat_delivered(message_sequence bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation_id uuid;
  delivered_sequence bigint;
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select message.conversation_id
  into target_conversation_id
  from public.chat_messages as message
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  where message.sequence = message_sequence
    and message.sender_id <> auth.uid()
    and (
      auth.uid() = conversation.first_user_id
      or auth.uid() = conversation.second_user_id
    );

  if target_conversation_id is null then
    raise exception 'Unknown incoming chat message sequence'
      using errcode = '22023';
  end if;

  insert into public.chat_read_state (
    conversation_id,
    user_id,
    last_delivered_sequence
  )
  values (target_conversation_id, auth.uid(), message_sequence)
  on conflict (conversation_id, user_id) do update
    set last_delivered_sequence = greatest(
      coalesce(public.chat_read_state.last_delivered_sequence, 0),
      excluded.last_delivered_sequence
    ),
    updated_at = now();

  select read_state.last_delivered_sequence
  into delivered_sequence
  from public.chat_read_state as read_state
  where read_state.conversation_id = target_conversation_id
    and read_state.user_id = auth.uid();

  return delivered_sequence;
end;
$$;

create or replace function public.mark_chat_read(message_sequence bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation_id uuid;
  unread_count bigint;
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select message.conversation_id
  into target_conversation_id
  from public.chat_messages as message
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  where message.sequence = message_sequence
    and message.sender_id <> auth.uid()
    and (
      auth.uid() = conversation.first_user_id
      or auth.uid() = conversation.second_user_id
    );

  if target_conversation_id is null then
    raise exception 'Unknown incoming chat message sequence'
      using errcode = '22023';
  end if;

  insert into public.chat_read_state (
    conversation_id,
    user_id,
    last_delivered_sequence,
    last_read_sequence
  )
  values (
    target_conversation_id,
    auth.uid(),
    message_sequence,
    message_sequence
  )
  on conflict (conversation_id, user_id) do update
    set last_delivered_sequence = greatest(
      coalesce(public.chat_read_state.last_delivered_sequence, 0),
      excluded.last_delivered_sequence
    ),
    last_read_sequence = greatest(
      coalesce(public.chat_read_state.last_read_sequence, 0),
      excluded.last_read_sequence
    ),
    updated_at = now();

  select count(*) into unread_count
  from public.chat_messages as message
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  left join public.chat_read_state as read_state
    on read_state.conversation_id = message.conversation_id
   and read_state.user_id = auth.uid()
  where message.sender_id <> auth.uid()
    and (
      auth.uid() = conversation.first_user_id
      or auth.uid() = conversation.second_user_id
    )
    and message.sequence > coalesce(read_state.last_read_sequence, 0);

  return unread_count;
end;
$$;

create or replace function public.get_chat_peer_receipt(target_conversation_id uuid)
returns table (
  last_delivered_sequence bigint,
  last_read_sequence bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select read_state.last_delivered_sequence, read_state.last_read_sequence
  from public.chat_conversations as conversation
  left join public.chat_read_state as read_state
    on read_state.conversation_id = conversation.id
   and read_state.user_id = case
     when conversation.first_user_id = auth.uid()
       then conversation.second_user_id
     else conversation.first_user_id
   end
  where conversation.id = target_conversation_id
    and (
      auth.uid() = conversation.first_user_id
      or auth.uid() = conversation.second_user_id
    );
end;
$$;

revoke all on function public.get_chat_peer_receipt(uuid) from public, anon;
grant execute on function public.get_chat_peer_receipt(uuid) to authenticated;

-- Legacy no-argument receipt RPC remains valid while the original users have
-- exactly one conversation. New clients always use the scoped RPC above.
create or replace function public.get_peer_chat_receipt()
returns table (
  last_delivered_sequence bigint,
  last_read_sequence bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_conversation_id uuid;
  conversation_count bigint;
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select count(*), (array_agg(conversation.id order by conversation.id))[1]
  into conversation_count, target_conversation_id
  from public.chat_conversations as conversation
  where auth.uid() = conversation.first_user_id
     or auth.uid() = conversation.second_user_id;

  if conversation_count <> 1 then
    raise exception 'Conversation id is required' using errcode = '22023';
  end if;

  return query
  select receipt.last_delivered_sequence, receipt.last_read_sequence
  from public.get_chat_peer_receipt(target_conversation_id) as receipt;
end;
$$;

create or replace function private.enqueue_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recipient_id uuid;
begin
  select case
    when conversation.first_user_id = new.sender_id
      then conversation.second_user_id
    else conversation.first_user_id
  end
  into recipient_id
  from public.chat_conversations as conversation
  where conversation.id = new.conversation_id;

  if recipient_id is null or not exists (
    select 1 from private.app_users as member where member.user_id = recipient_id
  ) then
    return new;
  end if;

  with inserted_event as (
    insert into public.notification_events (
      event_type,
      recipient_id,
      actor_id,
      source_id,
      payload
    )
    values (
      'chat.message_created',
      recipient_id,
      new.sender_id,
      new.id,
      jsonb_build_object(
        'message_id', new.id,
        'conversation_id', new.conversation_id
      )
    )
    on conflict (event_type, recipient_id, source_id) do nothing
    returning id, recipient_id
  )
  insert into public.notification_deliveries (event_id, subscription_id)
  select event.id, subscription.id
  from inserted_event as event
  join public.push_subscriptions as subscription
    on subscription.user_id = event.recipient_id
   and subscription.is_active;

  return new;
end;
$$;

update public.notification_events as event
set payload = event.payload || jsonb_build_object(
  'conversation_id', message.conversation_id
)
from public.chat_messages as message
where event.event_type = 'chat.message_created'
  and event.source_id = message.id;

drop function public.claim_notification_deliveries(integer);

create function public.claim_notification_deliveries(batch_size integer default 50)
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
  conversation_id uuid,
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
    message.conversation_id,
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

create or replace function private.can_access_chat_topic(topic text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_app_user() and exists (
    select 1
    from public.chat_conversations as conversation
    where topic = 'list-up:chat:' || conversation.id::text || ':live'
      and (
        auth.uid() = conversation.first_user_id
        or auth.uid() = conversation.second_user_id
      )
  );
$$;

revoke all on function private.can_access_chat_topic(text)
  from public, anon, authenticated;
grant execute on function private.can_access_chat_topic(text) to authenticated;

drop policy if exists list_up_chat_live_receive on realtime.messages;
drop policy if exists list_up_chat_live_send on realtime.messages;

create policy list_up_direct_chat_live_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and private.can_access_chat_topic((select realtime.topic()))
);

create policy list_up_direct_chat_live_send
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension = 'broadcast'
  and private.can_access_chat_topic((select realtime.topic()))
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'chat_conversations'
    )
  then
    alter publication supabase_realtime add table public.chat_conversations;
  end if;
end;
$$;

drop table private.allowed_user_emails;

commit;
