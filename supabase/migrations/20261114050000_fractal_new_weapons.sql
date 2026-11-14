-- Ecos dos Fractais: Bumerangue Fractal e Semeador de Fendas.
-- Inclui a autorização server-side, economia e conclusão automática de maestria.
-- Execute manualmente no SQL Editor do Supabase após publicar o código cliente.

begin;

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
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _upgrade is null or _upgrade not in (
    'area','experience','rarity','speed_2x','speed_3x',
    'health','projectile_duration','projectile_range','projectiles',
    'ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation',
    'anchor_soul','dash','omen_archive',
    'extra_xp','crit_chance','crit_damage','greed_pact','crit_relic',
    'weapon_nucleus','weapon_scythe','weapon_orbitals','weapon_gravity','weapon_sentinels','weapon_boomerang','weapon_rift_seeder',
    'evolution_void_revolver','evolution_nucleus','evolution_scythe','evolution_orbitals','evolution_gravity','evolution_sentinels','evolution_boomerang','evolution_rift_seeder'
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
    when _upgrade in ('reroll','oracle','extra_xp','crit_relic') then 1
    when _upgrade in ('anchor_soul','fortune','greed_pact') then 2
    when _upgrade in ('transmutation','crit_chance','crit_damage') then 3
    when _upgrade = 'omen_archive' then 4
    else 0
  end;

  if required_corruption > s.corruption_unlocked and not master_access then
    raise exception 'Esta melhoria exige Corrupção nível %', required_corruption;
  end if;

  is_level_upgrade := _upgrade in (
    'area','experience','rarity','projectile_range','projectiles',
    'health','projectile_duration','ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation','anchor_soul','dash',
    'extra_xp','crit_chance','crit_damage','greed_pact','crit_relic'
  );

  if is_level_upgrade then
    current_level := coalesce((upgrades->>_upgrade)::integer, 0);
    next_level := current_level + 1;
    max_level := case
      when _upgrade = 'health' then 15
      when _upgrade in ('crit_chance','crit_damage') then 20
      when _upgrade = 'extra_xp' then 10
      when _upgrade in ('greed_pact','banish','fortune') then 5
      when _upgrade = 'crit_relic' then 3
      when _upgrade in ('area','experience','projectile_range','projectiles') then 4
      when _upgrade = 'fortune' then 5
      when _upgrade = 'dash' then 3
      when _upgrade = 'anchor_soul' then 3
      when _upgrade in ('reroll','oracle') then 10
      when _upgrade = 'banish' then 5
      else 3
    end;

    if next_level > max_level then
      raise exception 'Esta melhoria já está no nível máximo';
    end if;

    price := case _upgrade
      when 'area' then (array[300,600,1000,1600])[next_level]
      when 'experience' then (array[250,500,900,1400])[next_level]
      when 'rarity' then (array[400,800,1400])[next_level]
      when 'health' then (array[500,800,1200,1700,2300,3000,3800,4700,5700,6800,8000,9300,10700,12200,13800])[next_level]
      when 'projectile_duration' then (array[600,1000,1600])[next_level]
      when 'projectile_range' then (array[350,600,1000,1600])[next_level]
      when 'projectiles' then (array[700,1200,1800,2800])[next_level]
      when 'ricochet' then (array[500,900,1400])[next_level]
      when 'piercing' then (array[600,1000,1500])[next_level]
      when 'chain_lightning' then (array[700,1200,1800])[next_level]
      when 'reroll' then (array[500,800,1200,1700,2300,3000,3800,4700,5700,6800])[next_level]
      when 'oracle' then (array[1000,2000,4000,8000,16000,32000,64000,128000,256000,512000])[next_level]
      when 'banish' then (array[600,1000,1500,2200,3000])[next_level]
      when 'fortune' then (array[800,1400,2300,3500,5000])[next_level]
      when 'transmutation' then (array[1500,2700,4500])[next_level]
      when 'anchor_soul' then (array[3500,7000,20000])[next_level]
      when 'dash' then (array[3000,8500,22000])[next_level]
      when 'extra_xp' then (array[600,1200,2000,3200,4800,6800,9200,12000,15500,20000])[next_level]
      when 'crit_chance' then (array[2500,3200,4000,5000,6200,7500,9000,10800,12800,15000,17500,20000,23000,26000,29500,33500,38000,43000,48500,55000])[next_level]
      when 'crit_damage' then (array[2500,3200,4000,5000,6200,7500,9000,10800,12800,15000,17500,20000,23000,26000,29500,33500,38000,43000,48500,55000])[next_level]
      when 'greed_pact' then (array[1000,2200,4000,6500,10000])[next_level]
      when 'crit_relic' then (array[1500,3500,7000])[next_level]
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
      when 'omen_archive' then 6000
      when 'weapon_nucleus' then 8000
      when 'weapon_scythe' then 9000
      when 'weapon_orbitals' then 10000
      when 'weapon_gravity' then 11000
      when 'weapon_sentinels' then 12000
      when 'weapon_boomerang' then 13000
      when 'weapon_rift_seeder' then 14000
      when 'evolution_void_revolver' then 5000
      when 'evolution_nucleus' then 5000
      when 'evolution_scythe' then 5000
      when 'evolution_orbitals' then 5000
      when 'evolution_gravity' then 5000
      when 'evolution_sentinels' then 5000
      when 'evolution_boomerang' then 5000
      when 'evolution_rift_seeder' then 5000
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
        when 'evolution_boomerang' then 'mastery_boomerang'
        when 'evolution_rift_seeder' then 'mastery_rift_seeder'
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

create or replace function public.start_fractal_run(
  _corruption integer,
  _weapon text default 'void_revolver',
  _omen text default null,
  _mission_id integer default 1
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
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _corruption is null or _corruption < 0 or _corruption > 5 then
    raise exception 'Nível de corrupção inválido';
  end if;

  if _mission_id is null or _mission_id < 1 or _mission_id > 5 then
    raise exception 'Missão inválida';
  end if;

  -- A interface atualmente libera somente a Missão 1. Não aceite uma missão
  -- bloqueada via chamada RPC manual; remova esta trava quando mapas futuros
  -- forem realmente desbloqueados pelo backend.
  if _mission_id <> 1 then
    raise exception 'Esta missão ainda está bloqueada';
  end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select *
  into s
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
    when 'fractal_boomerang' then 'weapon_boomerang'
    when 'rift_seeder' then 'weapon_rift_seeder'
    else 'invalid'
  end;

  if weapon_purchase_key = 'invalid' then
    raise exception 'Arma inválida';
  end if;

  if weapon_purchase_key is not null
    and not coalesce((s.purchased_upgrades->>weapon_purchase_key)::boolean, false)
  then
    raise exception 'Esta arma ainda não foi desbloqueada';
  end if;

  if _omen is not null then
    if _omen not in ('famine', 'rupture', 'spectral_veil', 'abundance', 'revenge') then
      raise exception 'Presságio inválido';
    end if;
    if not coalesce((s.purchased_upgrades->>'omen_archive')::boolean, false) then
      raise exception 'Desbloqueie o Arquivo dos Presságios antes de selecionar uma carta';
    end if;
    if _corruption < 4 then
      raise exception 'Os Presságios exigem Corrupção nível 4';
    end if;
  end if;

  insert into public.fractal_runs(
    user_id,
    corruption_level,
    selected_weapon,
    selected_omen,
    mission_id
  )
  values (
    auth.uid(),
    _corruption,
    _weapon,
    _omen,
    _mission_id
  )
  returning id into run_id;

  return run_id;
end;
$$;

revoke all on function public.start_fractal_run(integer, text, text, integer) from public, anon;
grant execute on function public.start_fractal_run(integer, text, text, integer) to authenticated;

-- A maestria só é concedida quando a própria run muda de ativa para vitória.
-- A função de liquidação já valida tempo, usuário e estado antes dessa transição.
create or replace function public.unlock_new_fractal_weapon_mastery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'won' then
    if new.selected_weapon = 'fractal_boomerang' then
      update public.fractal_player_state
      set purchased_upgrades = pg_catalog.jsonb_set(
        coalesce(purchased_upgrades, '{}'::jsonb),
        '{mastery_boomerang}',
        'true'::jsonb,
        true
      ),
      updated_at = pg_catalog.now()
      where user_id = new.user_id;
    elsif new.selected_weapon = 'rift_seeder' then
      update public.fractal_player_state
      set purchased_upgrades = pg_catalog.jsonb_set(
        coalesce(purchased_upgrades, '{}'::jsonb),
        '{mastery_rift_seeder}',
        'true'::jsonb,
        true
      ),
      updated_at = pg_catalog.now()
      where user_id = new.user_id;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.unlock_new_fractal_weapon_mastery() from public, anon;

drop trigger if exists fractal_runs_unlock_new_weapon_mastery on public.fractal_runs;
create trigger fractal_runs_unlock_new_weapon_mastery
after update of status on public.fractal_runs
for each row
execute function public.unlock_new_fractal_weapon_mastery();

-- Inicializa somente chaves ausentes em uma única passagem, preservando progresso existente.
update public.fractal_player_state
set purchased_upgrades =
  pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              coalesce(purchased_upgrades, '{}'::jsonb),
              '{weapon_boomerang}',
              coalesce(purchased_upgrades -> 'weapon_boomerang', 'false'::jsonb),
              true
            ),
            '{weapon_rift_seeder}',
            coalesce(purchased_upgrades -> 'weapon_rift_seeder', 'false'::jsonb),
            true
          ),
          '{mastery_boomerang}',
          coalesce(purchased_upgrades -> 'mastery_boomerang', 'false'::jsonb),
          true
        ),
        '{mastery_rift_seeder}',
        coalesce(purchased_upgrades -> 'mastery_rift_seeder', 'false'::jsonb),
        true
      ),
      '{evolution_boomerang}',
      coalesce(purchased_upgrades -> 'evolution_boomerang', 'false'::jsonb),
      true
    ),
    '{evolution_rift_seeder}',
    coalesce(purchased_upgrades -> 'evolution_rift_seeder', 'false'::jsonb),
    true
  )
where purchased_upgrades is null
   or not (purchased_upgrades ?& array[
     'weapon_boomerang',
     'weapon_rift_seeder',
     'mastery_boomerang',
     'mastery_rift_seeder',
     'evolution_boomerang',
     'evolution_rift_seeder'
   ]);

commit;
