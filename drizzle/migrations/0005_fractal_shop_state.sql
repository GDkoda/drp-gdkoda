-- Persistent Fractal shop state and server-side purchases.
-- Run this migration in the Supabase SQL editor before connecting the shop UI.

create table if not exists public.fractal_player_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  fractals integer not null default 0 check (fractals >= 0),
  corruption_unlocked integer not null default 0 check (corruption_unlocked between 0 and 5),
  purchased_upgrades jsonb not null default '{"area":0,"experience":0,"rarity":0,"speed_2x":false,"speed_3x":false}'::jsonb,
  completed_corruptions integer[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.fractal_player_state enable row level security;
drop policy if exists "fractal state own read" on public.fractal_player_state;
create policy "fractal state own read" on public.fractal_player_state
  for select to authenticated using (user_id = auth.uid());
revoke all on public.fractal_player_state from anon, authenticated;
grant select on public.fractal_player_state to authenticated;

create or replace function public.get_fractal_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id = auth.uid();
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = 'master'
  ) into master_access;
  return jsonb_build_object(
    'fractals', s.fractals,
    'corruptionUnlocked', s.corruption_unlocked,
    'completedCorruptions', to_jsonb(s.completed_corruptions),
    'purchasedUpgrades', s.purchased_upgrades,
    'isMaster', master_access
  );
end;
$$;

create or replace function public.purchase_fractal_upgrade(_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
  current_level integer;
  next_level integer;
  price integer;
  upgrades jsonb;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _upgrade not in ('area','experience','rarity','speed_2x','speed_3x') then
    raise exception 'Melhoria inválida';
  end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id = auth.uid() for update;
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = 'master'
  ) into master_access;
  upgrades := s.purchased_upgrades;

  if _upgrade in ('area','experience','rarity') then
    current_level := coalesce((upgrades->>_upgrade)::integer, 0);
    next_level := current_level + 1;
    if next_level > 3 then raise exception 'Esta melhoria já está no nível máximo'; end if;
    price := case _upgrade
      when 'area' then (array[300,600,1000])[next_level]
      when 'experience' then (array[250,500,900])[next_level]
      else (array[400,800,1400])[next_level]
    end;
    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;
    update public.fractal_player_state
      set fractals = case when master_access then fractals else fractals - price end,
          purchased_upgrades = jsonb_set(upgrades, array[_upgrade], to_jsonb(next_level), true),
          updated_at = now()
      where user_id = auth.uid();
  else
    if coalesce((upgrades->>_upgrade)::boolean,false) then
      raise exception 'Esta melhoria já foi comprada';
    end if;
    if _upgrade = 'speed_3x' and not coalesce((upgrades->>'speed_2x')::boolean,false) and not master_access then
      raise exception 'Compre primeiro a velocidade 2x';
    end if;
    price := case when _upgrade='speed_2x' then 1000 else 2000 end;
    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;
    update public.fractal_player_state
      set fractals = case when master_access then fractals else fractals - price end,
          purchased_upgrades = jsonb_set(upgrades, array[_upgrade], 'true'::jsonb, true),
          updated_at = now()
      where user_id = auth.uid();
  end if;

  return public.get_fractal_state();
end;
$$;

revoke all on function public.get_fractal_state() from public, anon;
revoke all on function public.purchase_fractal_upgrade(text) from public, anon;
grant execute on function public.get_fractal_state() to authenticated;
grant execute on function public.purchase_fractal_upgrade(text) to authenticated;


-- Run progression: only the currently unlocked corruption can be started.
create table if not exists public.fractal_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  corruption_level integer not null check (corruption_level between 0 and 5),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'active' check (status in ('active','won','lost')),
  unique (id, user_id)
);
alter table public.fractal_runs enable row level security;
drop policy if exists "fractal runs own read" on public.fractal_runs;
create policy "fractal runs own read" on public.fractal_runs
  for select to authenticated using (user_id = auth.uid());
revoke all on public.fractal_runs from anon, authenticated;
grant select on public.fractal_runs to authenticated;

create or replace function public.start_fractal_run(_corruption integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  run_id uuid;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _corruption < 0 or _corruption > 5 then raise exception 'Nível de corrupção inválido'; end if;
  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id=auth.uid() for update;
  if _corruption > s.corruption_unlocked then
    raise exception 'Conclua o nível anterior para liberar esta corrupção';
  end if;
  insert into public.fractal_runs(user_id,corruption_level)
  values (auth.uid(),_corruption) returning id into run_id;
  return run_id;
end;
$$;

create or replace function public.finish_fractal_run(_run_id uuid, _victory boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.fractal_runs;
  s public.fractal_player_state;
  master_access boolean;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  select * into r from public.fractal_runs
  where id=_run_id and user_id=auth.uid() for update;
  if not found then raise exception 'Expedição não encontrada'; end if;
  if r.status <> 'active' then raise exception 'Esta expedição já foi encerrada'; end if;
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role::text='master')
    into master_access;
  if _victory and not master_access and now() < r.started_at + interval '11 minutes' then
    raise exception 'A expedição ainda não atingiu o tempo mínimo para validar o guardião';
  end if;
  update public.fractal_runs
    set status=case when _victory then 'won' else 'lost' end, finished_at=now()
    where id=_run_id;
  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id=auth.uid() for update;
  if _victory then
    update public.fractal_player_state
      set completed_corruptions = array(select distinct unnest(completed_corruptions || r.corruption_level) order by 1),
          corruption_unlocked = greatest(corruption_unlocked, least(5, r.corruption_level + 1)),
          updated_at=now()
      where user_id=auth.uid();
  end if;
  return public.get_fractal_state();
end;
$$;

revoke all on function public.start_fractal_run(integer) from public, anon;
revoke all on function public.finish_fractal_run(uuid,boolean) from public, anon;
grant execute on function public.start_fractal_run(integer) to authenticated;
grant execute on function public.finish_fractal_run(uuid,boolean) to authenticated;
