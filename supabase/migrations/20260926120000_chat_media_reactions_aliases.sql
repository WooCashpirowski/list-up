-- Message content is exclusive: text, one private photo, or one GIPHY GIF.
alter table public.chat_messages
  add column kind text not null default 'text',
  add column media_path text,
  add column gif_id text;

alter table public.chat_messages drop constraint chat_messages_body_length;
alter table public.chat_messages add constraint chat_messages_content_check check (
  (kind = 'text' and char_length(body) between 1 and 2000
    and body = btrim(body) and media_path is null and gif_id is null)
  or (kind = 'photo' and body = '' and gif_id is null and media_path is not null
    and media_path = conversation_id::text || '/' || sender_id::text || '/' || id::text || '.jpg')
  or (kind = 'gif' and body = '' and media_path is null
    and gif_id is not null and gif_id ~ '^[A-Za-z0-9_-]{1,80}$')
);

create table public.chat_message_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32 and emoji = btrim(emoji)),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index chat_message_reactions_conversation_idx
  on public.chat_message_reactions(conversation_id);
alter table public.chat_message_reactions replica identity full;

create function private.prepare_chat_reaction() returns trigger
language plpgsql security definer set search_path = '' as $$
declare source_message public.chat_messages%rowtype;
begin
  select * into source_message from public.chat_messages where id = new.message_id;
  if not found or source_message.sender_id = auth.uid() then
    raise exception 'Only incoming messages can be reacted to' using errcode = '42501';
  end if;
  new.user_id := auth.uid();
  new.conversation_id := source_message.conversation_id;
  new.emoji := btrim(new.emoji);
  return new;
end;
$$;
revoke all on function private.prepare_chat_reaction() from public, anon, authenticated;
create trigger chat_reaction_prepare before insert or update
  on public.chat_message_reactions for each row execute function private.prepare_chat_reaction();

alter table public.chat_message_reactions enable row level security;
revoke all on public.chat_message_reactions from public, anon, authenticated;
grant select, insert, delete on public.chat_message_reactions to authenticated;
grant update (emoji) on public.chat_message_reactions to authenticated;
create policy chat_reactions_read_participant on public.chat_message_reactions
  for select to authenticated using (
    private.is_app_user() and exists (
      select 1 from public.chat_conversations conversation
      where conversation.id = conversation_id
        and auth.uid() in (conversation.first_user_id, conversation.second_user_id)
    )
  );
create policy chat_reactions_insert_own on public.chat_message_reactions
  for insert to authenticated with check (
    private.is_app_user() and user_id = auth.uid() and exists (
      select 1 from public.chat_messages message
      join public.chat_conversations conversation on conversation.id = message.conversation_id
      where message.id = message_id and message.conversation_id = conversation_id
        and message.sender_id <> auth.uid()
        and auth.uid() in (conversation.first_user_id, conversation.second_user_id)
    )
  );
create policy chat_reactions_update_own on public.chat_message_reactions
  for update to authenticated using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy chat_reactions_delete_own on public.chat_message_reactions
  for delete to authenticated using (user_id = auth.uid());

create function public.set_chat_reaction(target_message_id uuid, selected_emoji text)
returns void language plpgsql security definer set search_path = '' as $$
declare source_message public.chat_messages%rowtype;
begin
  select * into source_message from public.chat_messages where id = target_message_id;
  if not found or not private.is_app_user() or source_message.sender_id = auth.uid()
    or not exists (select 1 from public.chat_conversations conversation
      where conversation.id = source_message.conversation_id
        and auth.uid() in (conversation.first_user_id, conversation.second_user_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if selected_emoji is null then
    delete from public.chat_message_reactions
      where message_id = target_message_id and user_id = auth.uid();
  else
    insert into public.chat_message_reactions(message_id, conversation_id, user_id, emoji)
    values (target_message_id, source_message.conversation_id, auth.uid(), btrim(selected_emoji))
    on conflict (message_id, user_id) do update set emoji = excluded.emoji;
  end if;
end;
$$;
revoke all on function public.set_chat_reaction(uuid, text) from public, anon;
grant execute on function public.set_chat_reaction(uuid, text) to authenticated;

create table public.chat_peer_aliases (
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  peer_id uuid not null references public.profiles(id) on delete cascade,
  alias text not null check (char_length(alias) between 1 and 60 and alias = btrim(alias)),
  primary key (owner_id, peer_id),
  check (owner_id <> peer_id)
);
alter table public.chat_peer_aliases replica identity full;
alter table public.chat_peer_aliases enable row level security;
revoke all on public.chat_peer_aliases from public, anon, authenticated;
grant select, insert, delete on public.chat_peer_aliases to authenticated;
grant update (alias) on public.chat_peer_aliases to authenticated;
create policy chat_peer_aliases_owner_read on public.chat_peer_aliases
  for select to authenticated using (private.is_app_user() and owner_id = auth.uid());
create policy chat_peer_aliases_owner_insert on public.chat_peer_aliases
  for insert to authenticated with check (
    private.is_app_user() and owner_id = auth.uid() and exists (
      select 1 from public.chat_conversations conversation
      where auth.uid() in (conversation.first_user_id, conversation.second_user_id)
        and peer_id in (conversation.first_user_id, conversation.second_user_id)
    )
  );
create policy chat_peer_aliases_owner_update on public.chat_peer_aliases
  for update to authenticated using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
create policy chat_peer_aliases_owner_delete on public.chat_peer_aliases
  for delete to authenticated using (owner_id = auth.uid());

create function public.set_chat_peer_alias(target_peer_id uuid, selected_alias text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_app_user() or target_peer_id = auth.uid()
    or not exists (select 1 from public.chat_conversations conversation
      where auth.uid() in (conversation.first_user_id, conversation.second_user_id)
        and target_peer_id in (conversation.first_user_id, conversation.second_user_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if selected_alias is null then
    delete from public.chat_peer_aliases
      where owner_id = auth.uid() and peer_id = target_peer_id;
  else
    insert into public.chat_peer_aliases(owner_id, peer_id, alias)
    values (auth.uid(), target_peer_id, btrim(selected_alias))
    on conflict (owner_id, peer_id) do update set alias = excluded.alias;
  end if;
end;
$$;
revoke all on function public.set_chat_peer_alias(uuid, text) from public, anon;
grant execute on function public.set_chat_peer_alias(uuid, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg'];

create policy chat_photos_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and split_part(name, '/', 2) = auth.uid()::text
  and private.is_app_user()
  and exists (
    select 1 from public.chat_conversations conversation
    where conversation.id::text = split_part(name, '/', 1)
      and auth.uid() in (conversation.first_user_id, conversation.second_user_id)
  )
);
create policy chat_photos_read on storage.objects for select to authenticated
using (
  bucket_id = 'chat-photos' and private.is_app_user()
  and exists (
    select 1 from public.chat_conversations conversation
    where conversation.id::text = split_part(name, '/', 1)
      and auth.uid() in (conversation.first_user_id, conversation.second_user_id)
  )
);

drop function public.get_chat_inbox();
create function public.get_chat_inbox() returns table (
  conversation_id uuid, peer_id uuid, peer_email text, peer_display_name text,
  peer_alias text, last_message_id uuid, last_message_sender_id uuid,
  last_message_body text, last_message_kind text, last_message_sequence bigint,
  last_message_created_at timestamptz, last_incoming_sequence bigint,
  unread_count bigint
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_app_user() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
  select conversation.id, peer.id, peer.email, peer.display_name, peer_label.alias,
    latest.id, latest.sender_id, latest.body, latest.kind, latest.sequence,
    latest.created_at,
    (select max(incoming.sequence) from public.chat_messages incoming
      where incoming.conversation_id = conversation.id and incoming.sender_id <> auth.uid()),
    (select count(*) from public.chat_messages unread
      where unread.conversation_id = conversation.id and unread.sender_id <> auth.uid()
        and unread.sequence > coalesce(read_state.last_read_sequence, 0))
  from public.chat_conversations conversation
  join public.profiles peer on peer.id = case
    when conversation.first_user_id = auth.uid() then conversation.second_user_id
    else conversation.first_user_id end
  join private.app_users peer_membership on peer_membership.user_id = peer.id
  left join public.chat_peer_aliases peer_label
    on peer_label.owner_id = auth.uid() and peer_label.peer_id = peer.id
  left join public.chat_read_state read_state
    on read_state.conversation_id = conversation.id and read_state.user_id = auth.uid()
  left join lateral (select message.* from public.chat_messages message
    where message.conversation_id = conversation.id order by message.sequence desc limit 1) latest on true
  where auth.uid() in (conversation.first_user_id, conversation.second_user_id)
  order by latest.sequence desc nulls last, lower(coalesce(peer_label.alias, peer.display_name)), lower(peer.email);
end;
$$;
revoke all on function public.get_chat_inbox() from public, anon;
grant execute on function public.get_chat_inbox() to authenticated;

drop function public.claim_notification_deliveries(integer);
create function public.claim_notification_deliveries(batch_size integer default 50)
returns table (
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  event_type text, source_id uuid, recipient_id uuid, sender_name text,
  message_body text, conversation_id uuid, attempt_number integer
) language sql security definer set search_path = '' as $$
  with due as (
    select delivery.id from public.notification_deliveries delivery
    where (delivery.status in ('pending', 'retry')
      or (delivery.status = 'processing' and delivery.lease_until <= now()))
      and delivery.next_attempt_at <= now() and delivery.attempts < 5
    order by delivery.created_at for update skip locked
    limit least(greatest(coalesce(batch_size, 50), 1), 50)
  ), claimed as (
    update public.notification_deliveries delivery
    set status = 'processing', attempts = delivery.attempts + 1,
      lease_until = now() + interval '2 minutes', updated_at = now()
    from due where delivery.id = due.id returning delivery.*
  )
  select claimed.id, subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth, event.event_type, event.source_id, event.recipient_id,
    coalesce(peer_label.alias, actor.display_name, split_part(actor.email, '@', 1), 'List Up!'),
    case message.kind when 'photo' then '📷 Photo'
      when 'gif' then 'GIF' else message.body end,
    message.conversation_id, claimed.attempts
  from claimed
  join public.notification_events event on event.id = claimed.event_id
  join public.push_subscriptions subscription
    on subscription.id = claimed.subscription_id and subscription.is_active
  left join public.profiles actor on actor.id = event.actor_id
  left join public.chat_peer_aliases peer_label
    on peer_label.owner_id = event.recipient_id and peer_label.peer_id = event.actor_id
  left join public.chat_messages message
    on event.event_type = 'chat.message_created' and message.id = event.source_id;
$$;
revoke all on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.chat_message_reactions;
    alter publication supabase_realtime add table public.chat_peer_aliases;
  end if;
end $$;
