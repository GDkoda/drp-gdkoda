-- Ecos dos Fractais — Arsenal expandido, crítico permanente e Pacto da Ganância.
-- Esta migração preserva as regras de compra já existentes (armas, evoluções,
-- maestrias, velocidade, presságios e progressão anterior) e acrescenta as
-- cinco novas melhorias permanentes.
--
-- Correção intencional do texto-base: Erudição VIII custa 12.000 FR, não 1.200 FR.
-- O multiplicador do Pacto é calculado no servidor a partir do estado persistido.

begin;

-- 1. Inicializa os novos campos sem sobrescrever outras compras do jogador.
update public.fractal_player_state
set purchased_upgrades = coalesce(purchased_upgrades, '{}'::jsonb) ||
  jsonb_build_object(
    'extra_xp', coalesce((purchased_upgrades->>'extra_xp')::integer, 0),
    'crit_chance', coalesce((purchased_upgrades->>'crit_chance')::integer, 0),
    'crit_damage', coalesce((purchased_upgrades->>'crit_damage')::integer, 0),
    'greed_pact', coalesce((purchased_upgrades->>'greed_pact')::integer, 0),
    'crit_relic', coalesce((purchased_upgrades->>'crit_relic')::integer, 0)
  );

-- 2. Função de compra completa: mantém as validações anteriores e adiciona
-- custos, limites e requisitos de corrupção das novas melhorias.
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

-- 3. Atualiza a liquidação no servidor para incluir o Pacto da Ganância.
-- A recompensa original e os multiplicadores por missão/corrupção são preservados.
create or replace function public.finish_fractal_run_v2(
  _run_id uuid,
  _victory boolean,
  _game_seconds integer,
  _kills integer,
  _level integer,
  _mission_id integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.fractal_runs;
  s public.fractal_player_state;
  master_access boolean;
  max_speed integer := 1;
  real_seconds numeric;
  gs integer;
  k integer;
  lvl integer;
  minutes integer;
  earned integer := 0;
  run_mission_id integer;
  mission_mult numeric := 1.0;
  greed_mult numeric := 1.0;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _victory is null then
    raise exception 'Resultado da expedição inválido';
  end if;

  if _mission_id is null or _mission_id < 1 or _mission_id > 5 then
    raise exception 'Missão inválida';
  end if;

  select *
  into r
  from public.fractal_runs
  where id = _run_id
    and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'Expedição não encontrada';
  end if;

  run_mission_id := coalesce(r.mission_id, 1);

  -- O cliente precisa reportar a mesma missão gravada quando a expedição iniciou.
  -- O multiplicador é calculado a partir do registro do banco, não do parâmetro.
  if _mission_id <> run_mission_id then
    raise exception 'A missão informada não corresponde à expedição iniciada';
  end if;

  if r.status <> 'active' then
    if r.status in ('won', 'lost') then
      return public.get_fractal_state()
        || pg_catalog.jsonb_build_object(
          'earnedFractals', coalesce(r.earned_fractals, 0),
          'alreadySettled', true
        );
    end if;
    raise exception 'Esta expedição foi encerrada porque outra foi iniciada';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role::text = 'master'
  )
  into master_access;

  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select *
  into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  if coalesce((s.purchased_upgrades->>'speed_3x')::boolean, false) then
    max_speed := 3;
  elsif coalesce((s.purchased_upgrades->>'speed_2x')::boolean, false) then
    max_speed := 2;
  end if;

  real_seconds := extract(epoch from (pg_catalog.now() - r.started_at));
  gs := greatest(0, least(coalesce(_game_seconds, 0), 720));

  -- O tempo reportado não pode exceder o relógio real × velocidade comprada (+ 15 s).
  if not master_access then
    gs := least(gs, floor(real_seconds * max_speed + 15)::integer);
  end if;

  k := greatest(0, least(coalesce(_kills, 0), gs * 6));
  lvl := greatest(1, least(coalesce(_level, 1), 200));

  -- O Guardião aparece aos 11:00 (660 s); a vitória só pode ser validada depois disso.
  if _victory and not master_access and gs < 660 then
    raise exception 'A expedição ainda não atingiu o tempo de jogo necessário para validar o guardião';
  end if;

  -- Multiplicador por missão: 1 = 1.0x, 2 = 1.2x, 3 = 1.4x,
  -- 4 = 1.6x e 5 = 2.0x. As missões 2–5 permanecem bloqueadas até serem liberadas.
  if run_mission_id = 2 then
    mission_mult := 1.2;
  elsif run_mission_id = 3 then
    mission_mult := 1.4;
  elsif run_mission_id = 4 then
    mission_mult := 1.6;
  elsif run_mission_id >= 5 then
    mission_mult := 2.0;
  end if;

  minutes := gs / 60;

  if _victory then
    earned := floor((25 + r.corruption_level * 15) * mission_mult)::integer;
  elsif minutes >= 2 then
    -- Derrota só premia com abates reais (mínimo de 8 abates por minuto pago).
    earned := floor((least(minutes, k / 8) * (2 + r.corruption_level)) * mission_mult)::integer;
  end if;

  -- Pacto da Ganância: +5% por nível comprado para cada nível de Corrupção ativo.
  greed_mult := 1 + (
    least(5, greatest(0, coalesce((s.purchased_upgrades->>'greed_pact')::integer, 0)))
    * 0.05
    * greatest(0, r.corruption_level)
  );
  earned := floor(earned * greed_mult)::integer;

  update public.fractal_runs
  set status = case when _victory then 'won' else 'lost' end,
      finished_at = pg_catalog.now(),
      game_seconds = gs,
      kills = k,
      player_level = lvl,
      earned_fractals = earned,
      mission_id = run_mission_id
  where id = _run_id;

  if _victory then
    update public.fractal_player_state
    set fractals = fractals + earned,
        completed_corruptions = array(
          select distinct c.level
          from pg_catalog.unnest(s.completed_corruptions || r.corruption_level) as c(level)
          order by c.level
        ),
        corruption_unlocked = greatest(
          corruption_unlocked,
          least(5, r.corruption_level + 1)
        ),
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  elsif earned > 0 then
    update public.fractal_player_state
    set fractals = fractals + earned,
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  end if;

  return public.get_fractal_state()
    || pg_catalog.jsonb_build_object('earnedFractals', earned);
end;
$$;

revoke all on function public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer, integer) from public, anon;
grant execute on function public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer, integer) to authenticated;

commit;
