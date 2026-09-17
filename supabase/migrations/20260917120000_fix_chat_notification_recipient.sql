-- Fix the PL/pgSQL variable/column collision that aborts chat message inserts.
-- Keep the already-applied multi-user migration unchanged.

begin;

create or replace function private.enqueue_chat_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_recipient_id uuid;
begin
  select case
    when conversation.first_user_id = new.sender_id
      then conversation.second_user_id
    else conversation.first_user_id
  end
  into target_recipient_id
  from public.chat_conversations as conversation
  where conversation.id = new.conversation_id;

  if target_recipient_id is null or not exists (
    select 1
    from private.app_users as member
    where member.user_id = target_recipient_id
  ) then
    return new;
  end if;

  with inserted_event as (
    insert into public.notification_events as notification_event (
      event_type,
      recipient_id,
      actor_id,
      source_id,
      payload
    )
    values (
      'chat.message_created',
      target_recipient_id,
      new.sender_id,
      new.id,
      jsonb_build_object(
        'message_id', new.id,
        'conversation_id', new.conversation_id
      )
    )
    on conflict on constraint notification_events_unique_source do nothing
    returning notification_event.id, notification_event.recipient_id
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

revoke all on function private.enqueue_chat_notification()
  from public, anon, authenticated;

commit;
