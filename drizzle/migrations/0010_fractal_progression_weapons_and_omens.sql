-- Ecos dos Fractais: progression, rerolls, banishes, rewards, weapons and omens.
-- Execute this migration in Supabase SQL Editor after 20261110010000_fractal_projectile_relics.sql.

alter table public.fractal_player_state
  alter column purchased_upgrades set default
  '{
    "area":0,"experience":0,"rarity":0,"speed_2x":false,"speed_3x":false,
    "health":0,"projectile_duration":0,"projectile_range":0,"projectiles":0,
    "ricochet":0,"piercing":0,"chain_lightning":0,
    "reroll":0,"oracle":0,"banish":0,"fortune":0,"transmutation":0,
    "anchor_soul":false,"omen_archive":false,
    "weapon_nucleus":false,"weapon_scythe":false,"weapon_orbitals":false,"weapon_gravity":false,"weapon_sentinels":false,
    "mastery_void_revolver":false,"mastery_nucleus":false,"mastery_scythe":false,"mastery_orbitals":false,"mastery_gravity":false,"mastery_sentinels":false,
    "evolution_void_revolver":false,"evolution_nucleus":false,"evolution_scythe":false,"evolution_orbitals":false,"evolution_gravity":false,"evolution_sentinels":false
  }'::jsonb;

update public.fractal_player_state
set purchased_upgrades = coalesce(purchased_upgrades, '{}'::jsonb) || '{
  "reroll":0,"oracle":0,"banish":0,"fortune":0,"transmutation":0,
  "anchor_soul":false,"omen_archive":false,
  "weapon_nucleus":false,"weapon_scythe":false,"weapon_orbitals":false,"weapon_gravity":false,"weapon_sentinels":false,
  "mastery_void_revolver":false,"mastery_nucleus":false,"mastery_scythe":false,"mastery_orbitals":false,"mastery_gravity":false,"mastery_sentinels":false,
  "evolution_void_revolver":false,"evolution_nucleus":false,"evolution_scythe":false,"evolution_orbitals":false,"evolution_gravity":false,"evolution_sentinels":false
}'::jsonb;

alter table public.fractal_runs
  add column if not exists selected_weapon text not null default 'void_revolver',
  add column if not exists selected_omen text;

create or replace function public.purchase_fractal_upgrade(_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
  current_level integer;
  next_level integer;
  max_level integer;
  price integer;
  required_corruption integer := 0;
  upgrades jsonb;
  is_level_upgrade boolean;
  mastery_key text;
  weapon_key text;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _upgrade is null or _upgrade not in (
    'area','experience','rarity','speed_2x','speed_3x',
    'health','projectile_duration','projectile_range','projectiles',
    'ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation',
    'anchor_soul','omen_archive',
    'weapon_nucleus','weapon_scythe','weapon_orbitals','weapon_gravity','weapon_sentinels',
    'evolution_void_revolver','evolution_nucleus','evolution_scythe','evolution_orbitals','evolution_gravity','evolution_sentinels'
  ) then
    raise exception 'Melhoria inválida';
  end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;

  select * into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = 'master'
  ) into master_access;

  upgrades := coalesce(s.purchased_upgrades, '{}'::jsonb);

  required_corruption := case
    when _upgrade in ('reroll','oracle') then 1
    when _upgrade in ('anchor_soul','fortune') then 2
    when _upgrade = 'transmutation' then 3
    when _upgrade = 'omen_archive' then 4
    else 0
  end;

  if required_corruption > s.corruption_unlocked and not master_access then
    raise exception 'Esta melhoria exige Corrupção nível %', required_corruption;
  end if;

  is_level_upgrade := _upgrade in (
    'area','experience','rarity','projectile_range','projectiles',
    'health','projectile_duration','ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation'
  );

  if is_level_upgrade then
    current_level := coalesce((upgrades->>_upgrade)::integer, 0);
    next_level := current_level + 1;
    max_level := case
      when _upgrade = 'health' then 5
      when _upgrade = 'reroll' or _upgrade = 'oracle' then 10
      when _upgrade = 'banish' then 5
      else 3
    end;

    if next_level > max_level then
      raise exception 'Esta melhoria já está no nível máximo';
    end if;

    price := case _upgrade
      when 'area' then (array[300,600,1000])[next_level]
      when 'experience' then (array[250,500,900])[next_level]
      when 'rarity' then (array[400,800,1400])[next_level]
      when 'health' then (array[500,800,1200,1700,2300])[next_level]
      when 'projectile_duration' then (array[600,1000,1600])[next_level]
      when 'projectile_range' then (array[350,600,1000])[next_level]
      when 'projectiles' then (array[700,1200,1800])[next_level]
      when 'ricochet' then (array[500,900,1400])[next_level]
      when 'piercing' then (array[600,1000,1500])[next_level]
      when 'chain_lightning' then (array[700,1200,1800])[next_level]
      when 'reroll' then (array[500,800,1200,1700,2300,3000,3800,4700,5700,6800])[next_level]
      when 'oracle' then (array[1000,2000,4000,8000,16000,32000,64000,128000,256000,512000])[next_level]
      when 'banish' then (array[600,1000,1500,2200,3000])[next_level]
      when 'fortune' then (array[800,1400,2300])[next_level]
      when 'transmutation' then (array[1500,2700,4500])[next_level]
      else null
    end;

    if price is null then raise exception 'Preço da melhoria não configurado'; end if;
    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], to_jsonb(next_level), true),
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  else
    if coalesce((upgrades->>_upgrade)::boolean,false) then
      raise exception 'Esta melhoria já foi comprada';
    end if;

    if _upgrade = 'speed_3x'
      and not coalesce((upgrades->>'speed_2x')::boolean,false)
      and not master_access then
      raise exception 'Compre primeiro a velocidade 2x';
    end if;

    price := case _upgrade
      when 'speed_2x' then 1000
      when 'speed_3x' then 2000
      when 'anchor_soul' then 3500
      when 'omen_archive' then 6000
      when 'weapon_nucleus' then 8000
      when 'weapon_scythe' then 9000
      when 'weapon_orbitals' then 10000
      when 'weapon_gravity' then 11000
      when 'weapon_sentinels' then 12000
      when 'evolution_void_revolver' then 5000
      when 'evolution_nucleus' then 5000
      when 'evolution_scythe' then 5000
      when 'evolution_orbitals' then 5000
      when 'evolution_gravity' then 5000
      when 'evolution_sentinels' then 5000
      else null
    end;

    if price is null then raise exception 'Preço da melhoria não configurado'; end if;

    if pg_catalog.left(_upgrade, 10) = 'evolution_' then
      mastery_key := case _upgrade
        when 'evolution_void_revolver' then 'mastery_void_revolver'
        when 'evolution_nucleus' then 'mastery_nucleus'
        when 'evolution_scythe' then 'mastery_scythe'
        when 'evolution_orbitals' then 'mastery_orbitals'
        when 'evolution_gravity' then 'mastery_gravity'
        when 'evolution_sentinels' then 'mastery_sentinels'
      end;
      if not coalesce((upgrades->>mastery_key)::boolean,false) and not master_access then
        raise exception 'Conclua uma expedição vitoriosa com esta arma para liberar seu projeto';
      end if;
    end if;

    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], 'true'::jsonb, true),
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  end if;

  return public.get_fractal_state();
end;
$$;

revoke all on function public.purchase_fractal_upgrade(text) from public, anon;
grant execute on function public.purchase_fractal_upgrade(text) to authenticated;

drop function if exists public.start_fractal_run(integer);

create function public.start_fractal_run(
  _corruption integer,
  _weapon text default 'void_revolver',
  _omen text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.fractal_player_state;
  run_id uuid;
  weapon_purchase_key text;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _corruption is null or _corruption < 0 or _corruption > 5 then raise exception 'Nível de corrupção inválido'; end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;

  select * into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  if _corruption > s.corruption_unlocked then
    raise exception 'Conclua o nível anterior para liberar esta corrupção';
  end if;

  weapon_purchase_key := case _weapon
    when 'void_revolver' then null
    when 'unstable_core' then 'weapon_nucleus'
    when 'spectral_scythe' then 'weapon_scythe'
    when 'orbital_swords' then 'weapon_orbitals'
    when 'gravity_shackle' then 'weapon_gravity'
    when 'rune_sentinels' then 'weapon_sentinels'
    else 'invalid'
  end;

  if weapon_purchase_key = 'invalid' then raise exception 'Arma inválida'; end if;
  if weapon_purchase_key is not null
    and not coalesce((s.purchased_upgrades->>weapon_purchase_key)::boolean,false)
  then
    raise exception 'Esta arma ainda não foi desbloqueada';
  end if;

  if _omen is not null then
    if _omen not in ('famine','rupture','spectral_veil','abundance','revenge') then
      raise exception 'Presságio inválido';
    end if;
    if not coalesce((s.purchased_upgrades->>'omen_archive')::boolean,false) then
      raise exception 'Desbloqueie o Arquivo dos Presságios antes de selecionar uma carta';
    end if;
    if _corruption < 4 then
      raise exception 'Os Presságios exigem Corrupção nível 4';
    end if;
  end if;

  insert into public.fractal_runs(user_id,corruption_level,selected_weapon,selected_omen)
  values (auth.uid(),_corruption,_weapon,_omen)
  returning id into run_id;

  return run_id;
end;
$$;

revoke all on function public.start_fractal_run(integer,text,text) from public, anon;
grant execute on function public.start_fractal_run(integer,text,text) to authenticated;

create or replace function public.finish_fractal_run(_run_id uuid, _victory boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fractal_runs;
  s public.fractal_player_state;
  master_access boolean;
  survived_minutes integer;
  earned_fractals integer := 0;
  mastery_key text;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _victory is null then raise exception 'Resultado da expedição inválido'; end if;

  select * into r
  from public.fractal_runs
  where id = _run_id and user_id = auth.uid()
  for update;

  if not found then raise exception 'Expedição não encontrada'; end if;
  if r.status <> 'active' then raise exception 'Esta expedição já foi encerrada'; end if;

  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role::text = 'master'
  ) into master_access;

  if _victory and not master_access
    and pg_catalog.now() < r.started_at + interval '10 minutes'
  then
    raise exception 'A expedição ainda não atingiu o tempo mínimo para validar o guardião';
  end if;

  survived_minutes := greatest(
    0,
    floor(extract(epoch from (
      least(pg_catalog.now(), r.started_at + interval '12 minutes') - r.started_at
    )) / 60)::integer
  );

  if _victory then
    earned_fractals := 25 + (r.corruption_level * 15);
  elsif survived_minutes >= 2 then
    earned_fractals := survived_minutes * (2 + r.corruption_level);
  end if;

  update public.fractal_runs
  set status = case when _victory then 'won' else 'lost' end,
      finished_at = pg_catalog.now()
  where id = _run_id;

  insert into public.fractal_player_state(user_id)
  values (auth.uid()) on conflict (user_id) do nothing;

  select * into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  if _victory then
    mastery_key := case r.selected_weapon
      when 'void_revolver' then 'mastery_void_revolver'
      when 'unstable_core' then 'mastery_nucleus'
      when 'spectral_scythe' then 'mastery_scythe'
      when 'orbital_swords' then 'mastery_orbitals'
      when 'gravity_shackle' then 'mastery_gravity'
      when 'rune_sentinels' then 'mastery_sentinels'
      else null
    end;

    update public.fractal_player_state
    set fractals = fractals + earned_fractals,
        completed_corruptions = array(
          select distinct completed.level
          from pg_catalog.unnest(s.completed_corruptions || r.corruption_level) as completed(level)
          order by completed.level
        ),
        corruption_unlocked = greatest(corruption_unlocked, least(5, r.corruption_level + 1)),
        purchased_upgrades = case
          when mastery_key is null then purchased_upgrades
          else pg_catalog.jsonb_set(coalesce(purchased_upgrades, '{}'::jsonb), array[mastery_key], 'true'::jsonb, true)
        end,
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  elsif earned_fractals > 0 then
    update public.fractal_player_state
    set fractals = fractals + earned_fractals,
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  end if;

  return public.get_fractal_state()
    || pg_catalog.jsonb_build_object('earnedFractals', earned_fractals);
end;
$$;

revoke all on function public.finish_fractal_run(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_fractal_run(uuid, boolean) to authenticated;
