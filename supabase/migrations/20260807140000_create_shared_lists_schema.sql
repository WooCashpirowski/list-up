-- Shared Grocery & Todo PWA
-- The data is shared by two authenticated users. RLS does not use ownership;
-- it grants both allowlisted accounts access to the same rows.
-- Supabase's service_role and database-owner roles bypass RLS by design; never
-- expose a service-role key in the client application.

begin;

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to authenticated;

-- Check the current value in auth.users instead of trusting only the JWT email
-- claim, which can remain stale until the access token is refreshed.
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
    where auth_user.id = auth.uid()
      and auth_user.email_confirmed_at is not null
      and lower(auth_user.email) in (
        'cashpirowski@gmail.com',
        'renata.piorowska@gmail.com'
      )
  );
$$;

revoke all on function private.is_allowed_user() from public;
revoke all on function private.is_allowed_user() from anon;
revoke all on function private.is_allowed_user() from authenticated;
grant execute on function private.is_allowed_user() to authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on update cascade on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_blank check (btrim(email) <> ''),
  constraint profiles_email_is_allowed check (
    lower(email) in (
      'cashpirowski@gmail.com',
      'renata.piorowska@gmail.com'
    )
  )
);

create unique index profiles_email_lower_uidx
  on public.profiles (lower(email));

create table public.lists (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_by uuid default auth.uid()
    references public.profiles (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lists_title_length check (
    char_length(btrim(title)) between 1 and 200
  )
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  order_index integer not null default 0,
  keywords jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid()
    references public.profiles (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_name_length check (
    char_length(btrim(name)) between 1 and 120
  ),
  constraint categories_order_index_nonnegative check (order_index >= 0),
  constraint categories_keywords_is_array check (jsonb_typeof(keywords) = 'array')
);

create unique index categories_name_lower_uidx
  on public.categories (lower(name));

create index categories_keywords_gin_idx
  on public.categories using gin (keywords);

create table public.list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null
    references public.lists (id) on update cascade on delete cascade,
  category_id uuid
    references public.categories (id) on update cascade on delete set null,
  name text not null,
  quantity text,
  is_done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid()
    references public.profiles (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint list_items_name_length check (
    char_length(btrim(name)) between 1 and 300
  ),
  constraint list_items_done_state check (
    (is_done and done_at is not null)
    or (not is_done and done_at is null)
  )
);

create index lists_updated_at_idx
  on public.lists (updated_at desc);

create index list_items_list_id_idx
  on public.list_items (list_id);

create index list_items_category_id_idx
  on public.list_items (category_id);

create index list_items_open_by_list_idx
  on public.list_items (list_id, created_at)
  where not is_done;

create index list_items_done_at_idx
  on public.list_items (done_at)
  where is_done;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.set_updated_at() from anon;
revoke all on function private.set_updated_at() from authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger lists_set_updated_at
before update on public.lists
for each row execute function private.set_updated_at();

create trigger categories_set_updated_at
before update on public.categories
for each row execute function private.set_updated_at();

create trigger list_items_set_updated_at
before update on public.list_items
for each row execute function private.set_updated_at();

-- created_by is audit data: clients cannot impersonate the other shared user
-- or change the creator after a row has been inserted.
create or replace function private.set_created_by()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

revoke all on function private.set_created_by() from public;
revoke all on function private.set_created_by() from anon;
revoke all on function private.set_created_by() from authenticated;

create trigger lists_set_created_by
before insert or update of created_by on public.lists
for each row execute function private.set_created_by();

create trigger categories_set_created_by
before insert or update of created_by on public.categories
for each row execute function private.set_created_by();

create trigger list_items_set_created_by
before insert or update of created_by on public.list_items
for each row execute function private.set_created_by();

-- Keep is_done and done_at consistent even when the client sends only is_done.
create or replace function private.sync_list_item_done_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.is_done then
    new.done_at := coalesce(new.done_at, now());
  else
    new.done_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_list_item_done_at() from public;
revoke all on function private.sync_list_item_done_at() from anon;
revoke all on function private.sync_list_item_done_at() from authenticated;

create trigger list_items_sync_done_at
before insert or update of is_done, done_at on public.list_items
for each row execute function private.sync_list_item_done_at();

-- Item changes count as list activity, so the home screen's updated_at sorting
-- remains consistent even when a change arrives from the other device.
create or replace function private.touch_list_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.lists
    set updated_at = now()
    where id = old.list_id;

    return old;
  end if;

  update public.lists
  set updated_at = now()
  where id = new.list_id;

  if tg_op = 'UPDATE' and old.list_id is distinct from new.list_id then
    update public.lists
    set updated_at = now()
    where id = old.list_id;
  end if;

  return new;
end;
$$;

revoke all on function private.touch_list_from_item() from public;
revoke all on function private.touch_list_from_item() from anon;
revoke all on function private.touch_list_from_item() from authenticated;

create trigger list_items_touch_list
after insert or update or delete on public.list_items
for each row execute function private.touch_list_from_item();

-- Profiles are maintained from Supabase Auth. Unauthorized Auth accounts may
-- exist, but they receive no profile and private.is_allowed_user() denies them.
create or replace function private.sync_allowed_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(coalesce(new.email, '')) in (
    'cashpirowski@gmail.com',
    'renata.piorowska@gmail.com'
  ) then
    insert into public.profiles (id, email)
    values (new.id, lower(new.email))
    on conflict (id) do update
      set email = excluded.email;
  else
    delete from public.profiles
    where id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_allowed_profile() from public;
revoke all on function private.sync_allowed_profile() from anon;
revoke all on function private.sync_allowed_profile() from authenticated;

create trigger auth_users_sync_allowed_profile
after insert or update of email on auth.users
for each row execute function private.sync_allowed_profile();

-- Backfill profiles when either allowlisted Auth user predates this migration.
insert into public.profiles (id, email)
select auth_user.id, lower(auth_user.email)
from auth.users as auth_user
where lower(auth_user.email) in (
  'cashpirowski@gmail.com',
  'renata.piorowska@gmail.com'
)
on conflict (id) do update
  set email = excluded.email;

-- Seed the category dictionary from categories_rows.csv. order_index reflects
-- the alphabetical order required by the application specification.
insert into public.categories (id, name, order_index, created_at, keywords)
values
  ('2e74a37b-bd2b-40cc-8bf6-77cbb0fd5597', 'Alkohol', 1, '2025-12-05 17:33:18.332784+00', '["wino","piwo","whisky","wódka","szampan","cognac","brandy","rum","tequila","cydr","likier pomarańczowy","amaretto","miradore"]'::jsonb),
  ('513846e9-bfcf-46fc-9492-e33089de65e7', 'Art. gosp. domowego', 2, '2025-12-03 15:22:23.065745+00', '["mydło","proszek","detergent","środek czyszczący","ręcznik papierowy","papier toaletowy","chusteczki","worek na śmieci","gąbka","ręczniki papierowe","worki na śmieci","kieliszki","patelnia grill","płyn do płukania","nabłyszczacz","płyn do prania","persil","kostki wc","czajnik","płyn do kurzu","zapach do wc","miska","rękawiczki","płyn do naczyń frosch","ściereczki do zlewu","wkladki","farba do włosów","maszynki","kostki do zmywarki","płyn do naczyń","ręcznik"]'::jsonb),
  ('140f4432-7e25-4f29-bcd1-7bbfa997eabf', 'Elektronika', 3, '2026-01-07 12:08:32.729056+00', '["baterie","żarówki"]'::jsonb),
  ('526e8192-2521-49b4-bfba-4a3d15a42055', 'Higiena osobista', 4, '2025-12-03 15:22:23.065745+00', '["szampon","pasta do zębów","dezodorant","maszynka","żyletka","balsam","mydło","krem","papier","patyczki","waciki","pasta do zebow","wkładki","biały jeleń","filtr przeciwsłoneczny","filtr do twarzy","pianka pod prysznic rit","pilnik do paznokci","gąbeczki","tusz to rzęs gosh","pianka rit","płyn micelarny","odżywka","zmywacz","pumeks","hedenshoulders"]'::jsonb),
  ('7580c97b-62e1-40aa-adbc-03ba58d3a56c', 'Konserwy i przetwory', 5, '2025-12-03 15:22:23.065745+00', '["konserwa","puszka","fasola","zupa","sos pomidorowy","kukurydza","groszek","passata","gulasz angielski","koncentrat pomidorowy"]'::jsonb),
  ('b1a9a12b-e1ea-4ead-8b75-a2b36bc7140c', 'Makarony', 6, '2025-12-10 06:23:40.906849+00', '["tagiatelle","spaghetti","penne","świderki","fusili","makaron","kokardki"]'::jsonb),
  ('6fd7cd96-5c23-4aad-bfc9-365d477fbffb', 'Mięso i wędliny', 7, '2025-12-03 15:22:23.065745+00', '["kurczak","wołowina","wieprzowina","jagnięcina","indyk","boczek","kiełbasa","szynka","stek","mięso mielone","schab","karkówka","wędlina","smalec","karczek","pierś","salami","wędliny","parówki","żeberko","serrano","mortadella","polędwiczka","wedlina","hamburgery","żeberka"]'::jsonb),
  ('df83212c-8961-4243-99a0-a19e20a29feb', 'Mrożonki', 8, '2025-12-03 15:22:23.065745+00', '["mrożone","lody","mrożone warzywa","frytki","trio warzywne","paluszki rybne","mix warzywny","pierożki gyroza","trio warzyw biedronka","ricotta","lód"]'::jsonb),
  ('6c0211e8-c271-46b4-85d0-0a78177c2aac', 'Nabiał', 9, '2025-12-03 15:22:23.065745+00', '["mleko","ser","jogurt","masło","śmietana","kefir","twaróg","lody","jajka","drożdże","finu","cheddar","finnu","mozarella galbani","mozarella","gorgonzola picante","śmietanka 30","śmietanka","gouda","maslo","ricotta","halumi","oscypek","chedar","feta","parmezan","mascarpone"]'::jsonb),
  ('6c25b718-8547-4a29-9b36-6387b4ac0c6f', 'Napoje', 10, '2025-12-03 15:22:23.065745+00', '["woda","sok","napój","kawa","herbata","mleko","cola","fanta","syrop","rumianek"]'::jsonb),
  ('291a6061-b0ba-474b-8783-a43c8d535890', 'Obuwie', 11, '2026-01-07 10:30:26.965166+00', '["ciapy","buty"]'::jsonb),
  ('2842167d-5c44-4142-a54d-df681faed285', 'Odzież', 12, '2025-12-05 17:26:12.996883+00', '["spodnie","bluza","sweter","koszula","rajstopy","tshirt","spodenki","strój kąpielowy n","kapelusz","feta"]'::jsonb),
  ('021f05f4-2474-4230-866a-e55318de6606', 'Owoce', 13, '2025-12-03 15:22:23.065745+00', '["jabłko","banan","pomarańcza","winogrono","truskawka","jagoda","borówka","mango","gruszka","brzoskwinia","arbuz","cytryna","limonka","wiśnia","czereśnia","kiwi","ananas","maliny","pomarańcze","cytryny","liczi","smoczy owoc","mandarynki","winogrona","owoce na kompot z suszu","imbir","borówki","jabłka","rabarbar","truskawki","jeżyny"]'::jsonb),
  ('0369e193-dbd7-482a-91a2-fb598b3692d1', 'Pieczywo', 14, '2025-12-03 15:22:23.065745+00', '["chleb","bułka","bagietka","croissant","rogal","bajgiel","muffin","pączek","drożdżówka","bułki","pieczywo","tortilla","bagietki","awokado","bulka","chleb tostowy","chleb żytni","chleb pszenny","pizza","cebularz","brioszka","pita","brioszki"]'::jsonb),
  ('d9c5f8fb-83f0-4aa2-bcd8-0ba532ebf75e', 'Produkty zbożowe', 15, '2026-01-07 12:07:40.070932+00', '["mąka","ryż","kasza"]'::jsonb),
  ('3deba2ba-4549-495a-b404-47a4629c6ad9', 'Przekąski i słodycze', 16, '2025-12-03 15:22:23.065745+00', '["chipsy","ciastka","krakersy","popcorn","precelki","orzechy","cukierki","czekolada","batonik","slodycze","żelki","pistacje","kulki bonitki","nutella","biszkopty","daim","ciasteczka owsiane"]'::jsonb),
  ('9fa70e41-37a0-4c2a-8d26-6381126cc38a', 'Przyprawy i dodatki', 17, '2025-12-03 15:22:23.065745+00', '["ketchup","musztarda","majonez","sos","dressing","olej","ocet","sól","pieprz","przyprawa","płatki chilli","zioła prowansalskie","kumin","pasta curry","płatki chili","zioła toskańskie","wanilia","zioła","goździki","cynamon","cukier","cukier trzcinowy","oliwa","kurkuma"]'::jsonb),
  ('95c27d4a-60b6-4be0-9acf-b67f0bec3daa', 'Ryby i owoce morza', 18, '2025-12-03 15:22:23.065745+00', '["ryba","łosoś","tuńczyk","krewetka","krab","homar","dorsz","tilapia","owoce morza","śledź","makrela","miruna","krewetki","pstrąg","anchois"]'::jsonb),
  ('87448177-1fc7-436d-8106-119cb24b1b6b', 'Warzywa', 19, '2025-12-03 15:22:23.065745+00', '["pomidor","ziemniak","kartofel","cebula","marchew","sałata","szpinak","brokuł","ogórek","papryka","seler","kapusta","czosnek","grzyb","pieczarka","cukinia","kartofle","koper","pieczarki","warzywa","rukola","brukiew","rzeżucha","kalafior","rzodkiew","włoszczyzna","miks sałat","buraki","zakwas z buraków","karczochy","por","pietruszka","kalarepa","avocado","natka","szczypior","rucola","pomidorki koktajlowe","wloszczyzna","papryczka chili","pomodory","ogórki małosolne","burak","kurki","bób","chilli","baklazan"]'::jsonb),
  ('a3c25255-4b2a-423c-b1a0-345f56897784', 'Zioła', 20, '2025-12-13 07:27:53.847262+00', '["mięta","bazylia","kolendra","rozmaryn","oregano"]'::jsonb),
  ('661ed7d6-13c9-4976-a0a0-4c80b49890e2', 'Zwierzęta', 21, '2025-12-06 10:58:02.667466+00', '["żwirek","karma","puszki","szaszetki","smaczki"]'::jsonb);

alter table public.profiles enable row level security;
alter table public.lists enable row level security;
alter table public.categories enable row level security;
alter table public.list_items enable row level security;

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.lists from public, anon, authenticated;
revoke all on table public.categories from public, anon, authenticated;
revoke all on table public.list_items from public, anon, authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.lists to authenticated;
grant select, insert, update, delete on table public.categories to authenticated;
grant select, insert, update, delete on table public.list_items to authenticated;

-- profiles: both accounts may read shared profile data, but each account may
-- insert, update, or delete only its own profile row.
create policy profiles_select_allowed
on public.profiles
for select
to authenticated
using (private.is_allowed_user());

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (
  private.is_allowed_user()
  and id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (
  private.is_allowed_user()
  and id = auth.uid()
)
with check (
  private.is_allowed_user()
  and id = auth.uid()
  and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

create policy profiles_delete_own
on public.profiles
for delete
to authenticated
using (
  private.is_allowed_user()
  and id = auth.uid()
);

-- Shared application data: both allowlisted accounts have full CRUD access.
create policy lists_select_allowed
on public.lists
for select
to authenticated
using (private.is_allowed_user());

create policy lists_insert_allowed
on public.lists
for insert
to authenticated
with check (private.is_allowed_user());

create policy lists_update_allowed
on public.lists
for update
to authenticated
using (private.is_allowed_user())
with check (private.is_allowed_user());

create policy lists_delete_allowed
on public.lists
for delete
to authenticated
using (private.is_allowed_user());

create policy categories_select_allowed
on public.categories
for select
to authenticated
using (private.is_allowed_user());

create policy categories_insert_allowed
on public.categories
for insert
to authenticated
with check (private.is_allowed_user());

create policy categories_update_allowed
on public.categories
for update
to authenticated
using (private.is_allowed_user())
with check (private.is_allowed_user());

create policy categories_delete_allowed
on public.categories
for delete
to authenticated
using (private.is_allowed_user());

create policy list_items_select_allowed
on public.list_items
for select
to authenticated
using (private.is_allowed_user());

create policy list_items_insert_allowed
on public.list_items
for insert
to authenticated
with check (private.is_allowed_user());

create policy list_items_update_allowed
on public.list_items
for update
to authenticated
using (private.is_allowed_user())
with check (private.is_allowed_user());

create policy list_items_delete_allowed
on public.list_items
for delete
to authenticated
using (private.is_allowed_user());

-- Realtime is required for lists and list_items by project-spec.md. The guard
-- keeps the migration usable in environments without Supabase's publication.
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'lists'
    ) then
      alter publication supabase_realtime add table public.lists;
    end if;

    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'list_items'
    ) then
      alter publication supabase_realtime add table public.list_items;
    end if;
  end if;
end;
$$;

commit;
