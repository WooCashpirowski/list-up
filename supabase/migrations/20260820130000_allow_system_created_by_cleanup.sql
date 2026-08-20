-- Let trusted system operations apply foreign-key actions to audit columns.
-- Authenticated clients still cannot choose or change created_by.

begin;

create or replace function private.set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  elsif auth.uid() is not null then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

revoke all on function private.set_created_by()
  from public, anon, authenticated;

-- A profile is lifecycle-managed by auth.users. Letting a client delete only
-- its public profile would leave the Auth account in an unusable state.
revoke delete on table public.profiles from authenticated;
drop policy if exists profiles_delete_own on public.profiles;

commit;
