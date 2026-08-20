-- Keep the two-user allowlist environment-specific. Existing profiles seed the
-- initial values, so applying this migration does not change production access.

begin;

create table private.allowed_user_emails (
  email text primary key,
  created_at timestamptz not null default now(),
  constraint allowed_user_emails_normalized check (
    email = lower(btrim(email))
    and email <> ''
  )
);

revoke all on table private.allowed_user_emails
  from public, anon, authenticated;

insert into private.allowed_user_emails (email)
select distinct lower(btrim(profile.email))
from public.profiles as profile
where btrim(profile.email) <> ''
on conflict (email) do nothing;

-- A CHECK constraint cannot safely depend on environment-specific table data.
-- Profile writes remain protected by RLS and the auth.users synchronization
-- trigger, while historical profiles may remain for referential integrity.
alter table public.profiles
  drop constraint if exists profiles_email_is_allowed;

-- Read the current Auth record rather than trusting a potentially stale JWT
-- email claim. The caller must also have a confirmed email address.
create or replace function private.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users as auth_user
    join private.allowed_user_emails as allowed
      on allowed.email = lower(auth_user.email)
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
  );
$$;

revoke all on function private.is_allowed_user()
  from public, anon, authenticated;
grant execute on function private.is_allowed_user() to authenticated;

-- Keep an allowed Auth user and its public profile in sync. Removing an email
-- from the allowlist does not delete its historical profile: that could violate
-- chat foreign keys. RLS denies the removed account immediately.
create or replace function private.sync_allowed_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  default_name text;
begin
  if not exists (
    select 1
    from private.allowed_user_emails as allowed
    where allowed.email = lower(coalesce(new.email, ''))
  ) then
    return new;
  end if;

  default_name := left(
    initcap(regexp_replace(split_part(new.email, '@', 1), '[._-]+', ' ', 'g')),
    60
  );

  insert into public.profiles (id, email, display_name)
  values (new.id, lower(new.email), default_name)
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

revoke all on function private.sync_allowed_profile()
  from public, anon, authenticated;

commit;
