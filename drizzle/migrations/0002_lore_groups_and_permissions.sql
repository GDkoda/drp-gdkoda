create table public.lore_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.lore_group_members (
  group_id uuid not null references public.lore_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.lore_entries
  add column allowed_groups uuid[] not null default '{}';

create index lore_entries_allowed_groups_idx on public.lore_entries using gin(allowed_groups);
create index lore_group_members_user_idx on public.lore_group_members(user_id, group_id);

grant select, insert, update, delete on public.lore_groups, public.lore_group_members to authenticated;
grant all on public.lore_groups, public.lore_group_members to service_role;
alter table public.lore_groups enable row level security;
alter table public.lore_group_members enable row level security;

create policy "lore groups visible to members" on public.lore_groups
for select to authenticated
using (
  public.has_role(auth.uid(), 'master')
  or exists (
    select 1 from public.lore_group_members gm
    where gm.group_id = lore_groups.id and gm.user_id = auth.uid()
  )
);
create policy "lore groups master manage" on public.lore_groups
for all to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));

create policy "lore group members visible to self or master" on public.lore_group_members
for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'master'));
create policy "lore group members master manage" on public.lore_group_members
for all to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));

create or replace function public.can_read_lore_entry(_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lore_entries e
    where e.id = _entry
      and e.status = 'published'
      and e.published_at is not null
      and e.published_at <= now()
      and (
        e.visibility = 'public'
        or (
          e.visibility = 'restricted'
          and (
            auth.uid() = any(e.allowed_users)
            or exists (
              select 1
              from public.lore_group_members gm
              where gm.group_id = any(e.allowed_groups)
                and gm.user_id = auth.uid()
            )
          )
        )
      )
  );
$$;
revoke execute on function public.can_read_lore_entry(uuid) from public, anon;
grant execute on function public.can_read_lore_entry(uuid) to authenticated;

drop policy "lore comments insert on readable entry" on public.lore_comments;
create policy "lore comments insert on readable entry" on public.lore_comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and (
    public.has_role(auth.uid(), 'master')
    or public.can_read_lore_entry(entry_id)
  )
);

create or replace function public.touch_lore_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if TG_TABLE_NAME = 'lore_entries' and auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;