-- Complete the realtime setup and remove completed items from PostgreSQL.
-- The UI hides them after five minutes as well, but this job is the shared
-- source-of-truth cleanup when no client is open.

begin;

create extension if not exists pg_cron with schema extensions;

create or replace function private.delete_expired_list_items()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count bigint;
begin
  delete from public.list_items
  where is_done
    and done_at <= now() - interval '5 minutes';

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.delete_expired_list_items() from public;
revoke all on function private.delete_expired_list_items() from anon;
revoke all on function private.delete_expired_list_items() from authenticated;

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'delete-expired-list-items';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'delete-expired-list-items',
    '* * * * *',
    'select private.delete_expired_list_items();'
  );
end;
$$;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'categories'
  ) then
    alter publication supabase_realtime add table public.categories;
  end if;
end;
$$;

commit;
