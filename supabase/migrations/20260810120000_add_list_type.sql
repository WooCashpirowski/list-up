-- Distinguish categorized shopping lists from flat todo checklists.

begin;

alter table public.lists
  add column list_type text not null default 'shopping';

alter table public.lists
  add constraint lists_list_type_valid
  check (list_type in ('shopping', 'todo'));

comment on column public.lists.list_type is
  'Controls list behavior: shopping uses categories, todo is a flat checklist.';

create or replace function private.prevent_list_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.list_type is distinct from old.list_type then
    raise exception 'List type cannot be changed after creation';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_list_type_change() from public;
revoke all on function private.prevent_list_type_change() from anon;
revoke all on function private.prevent_list_type_change() from authenticated;

create trigger lists_prevent_list_type_change
before update of list_type on public.lists
for each row execute function private.prevent_list_type_change();

commit;
