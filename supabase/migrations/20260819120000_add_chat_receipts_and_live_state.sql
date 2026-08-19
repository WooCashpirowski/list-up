-- Add durable delivery/read receipts and authorize the ephemeral private
-- Realtime channel used for receipt refreshes and typing indicators.

begin;

alter table public.chat_read_state
add column last_delivered_sequence bigint
  references public.chat_messages (sequence) on update cascade on delete restrict;

update public.chat_read_state
set last_delivered_sequence = last_read_sequence
where last_read_sequence is not null;

alter table public.chat_read_state
add constraint chat_read_state_read_not_ahead_of_delivery check (
  last_read_sequence is null
  or (
    last_delivered_sequence is not null
    and last_read_sequence <= last_delivered_sequence
  )
);

create or replace function public.mark_chat_delivered(message_sequence bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_sequence bigint;
  delivered_sequence bigint;
begin
  if not private.is_allowed_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select message.sequence
  into existing_sequence
  from public.chat_messages as message
  where message.sequence = message_sequence
    and message.sender_id <> auth.uid();

  if existing_sequence is null then
    raise exception 'Unknown incoming chat message sequence'
      using errcode = '22023';
  end if;

  insert into public.chat_read_state (
    user_id,
    last_delivered_sequence
  )
  values (auth.uid(), existing_sequence)
  on conflict (user_id) do update
    set last_delivered_sequence = greatest(
      coalesce(public.chat_read_state.last_delivered_sequence, 0),
      excluded.last_delivered_sequence
    ),
    updated_at = now();

  select read_state.last_delivered_sequence
  into delivered_sequence
  from public.chat_read_state as read_state
  where read_state.user_id = auth.uid();

  return delivered_sequence;
end;
$$;

revoke all on function public.mark_chat_delivered(bigint) from public, anon;
grant execute on function public.mark_chat_delivered(bigint) to authenticated;

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
  where message.sequence = message_sequence
    and message.sender_id <> auth.uid();

  if existing_sequence is null then
    raise exception 'Unknown incoming chat message sequence'
      using errcode = '22023';
  end if;

  insert into public.chat_read_state (
    user_id,
    last_delivered_sequence,
    last_read_sequence
  )
  values (auth.uid(), existing_sequence, existing_sequence)
  on conflict (user_id) do update
    set last_delivered_sequence = greatest(
      coalesce(public.chat_read_state.last_delivered_sequence, 0),
      excluded.last_delivered_sequence
    ),
    last_read_sequence = greatest(
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

-- Expose only the peer's two cursors, not the peer's private read-state row.
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
begin
  if not private.is_allowed_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  select
    read_state.last_delivered_sequence,
    read_state.last_read_sequence
  from public.profiles as peer
  left join public.chat_read_state as read_state
    on read_state.user_id = peer.id
  where peer.id <> auth.uid()
  order by peer.id
  limit 1;
end;
$$;

revoke all on function public.get_peer_chat_receipt() from public, anon;
grant execute on function public.get_peer_chat_receipt() to authenticated;

-- Only allow the two allowlisted users to send and receive ephemeral events
-- on the one private chat channel. Postgres Changes continue to use table RLS.
create policy list_up_chat_live_receive
on realtime.messages
for select
to authenticated
using (
  (select realtime.topic()) = 'list-up:chat:live'
  and realtime.messages.extension = 'broadcast'
  and private.is_allowed_user()
);

create policy list_up_chat_live_send
on realtime.messages
for insert
to authenticated
with check (
  (select realtime.topic()) = 'list-up:chat:live'
  and realtime.messages.extension = 'broadcast'
  and private.is_allowed_user()
);

commit;
