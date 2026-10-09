create table public.spells (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  school text not null default '',
  requirements text not null default '',
  cost text not null default '',
  pm_cost integer not null default 0,
  range text not null default '',
  duration text not null default '',
  description text not null default '',
  source text not null default 'Compilado de Grimórios',
  created_at timestamptz not null default now()
);
grant select on public.spells to authenticated;
grant insert, update, delete on public.spells to authenticated;
grant all on public.spells to service_role;
alter table public.spells enable row level security;
create policy "spells read" on public.spells for select to authenticated using (true);
create policy "spells master" on public.spells for all to authenticated using (has_role(auth.uid(),'master')) with check (has_role(auth.uid(),'master'));
alter table public.characters add column known_spells uuid[] not null default '{}';

create or replace function public.cast_spell(_char uuid, _spell uuid, _pm integer default null)
returns integer language plpgsql security definer set search_path=public as $$
declare c record; cost int;
begin
  select * into c from characters where id=_char;
  if c is null or (c.owner_id<>auth.uid() and not has_role(auth.uid(),'master')) then raise exception 'Ficha não encontrada'; end if;
  select pm_cost into cost from spells where id=_spell;
  if cost is null then raise exception 'Magia não encontrada'; end if;
  if _pm is not null then cost := greatest(_pm,0); end if;
  if c.pm_current < cost then raise exception 'PM insuficiente (precisa %)', cost; end if;
  update characters set pm_current=pm_current-cost where id=_char;
  return c.pm_current-cost;
end $$;
grant execute on function public.cast_spell(uuid,uuid,integer) to authenticated;