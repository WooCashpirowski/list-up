-- Delivery receipts must use the delivery cursor, even when an older read
-- cursor exists. Keep the event kind and its sequence selected together.

begin;

create or replace function private.broadcast_chat_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipt_kind text;
  receipt_sequence bigint;
begin
  if new.last_read_sequence is distinct from old.last_read_sequence then
    receipt_kind := 'read';
    receipt_sequence := new.last_read_sequence;
  else
    receipt_kind := 'delivered';
    receipt_sequence := new.last_delivered_sequence;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'user_id', new.user_id,
      'kind', receipt_kind,
      'sequence', coalesce(receipt_sequence, 0)
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

commit;
