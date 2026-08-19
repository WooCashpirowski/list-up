-- Preserve push subscription ownership during service-role bookkeeping.
-- The opaque Supabase secret key maps to service_role but auth.uid() is null;
-- overwriting user_id in that context caused a successful push to be retried.

begin;

create or replace function private.prepare_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_user_id uuid := auth.uid();
begin
  if request_user_id is not null then
    new.user_id := request_user_id;
  elsif tg_op = 'UPDATE' then
    new.user_id := old.user_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.prepare_push_subscription()
  from public, anon, authenticated;

-- These deliveries reached the push provider successfully. Only the
-- subsequent last_success_at update failed, so retrying them creates duplicate
-- notifications. Repair their subscription metadata before clearing the error.
update public.push_subscriptions as subscription
set last_success_at = coalesce(subscription.last_success_at, now()),
    is_active = true
where exists (
  select 1
  from public.notification_deliveries as delivery
  where delivery.subscription_id = subscription.id
    and delivery.last_error like
      '%null value in column "user_id" of relation "push_subscriptions"%'
);

update public.notification_deliveries
set status = 'sent',
    sent_at = coalesce(sent_at, now()),
    next_attempt_at = now(),
    lease_until = null,
    last_error = null
where last_error like
  '%null value in column "user_id" of relation "push_subscriptions"%';

commit;
