-- Ecos dos Fractais — missão da expedição, recompensas por mapa e telemetria do Mestre.
-- Execute depois das migrações que criam fractal_runs, fractal_player_state e finish_fractal_run_v2.
--
-- A missão é gravada no início da run e validada novamente na liquidação.
-- No estado atual do jogo, somente a Missão 1 está liberada na interface.

-- 1. Identificador persistente da missão.
alter table public.fractal_runs
  add column if not exists mission_id integer;

update public.fractal_runs
set mission_id = 1
where mission_id is null or mission_id < 1 or mission_id > 5;

alter table public.fractal_runs
  alter column mission_id set default 1,
  alter column mission_id set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'fractal_runs_mission_id_check'
      and conrelid = 'public.fractal_runs'::regclass
  ) then
    alter table public.fractal_runs
      add constraint fractal_runs_mission_id_check
      check (mission_id between 1 and 5);
  end if;
end;
$$;

-- A rotina de início encerra runs antigas como abandoned. Permita esse estado
-- no CHECK, além dos estados já usados pela liquidação.
alter table public.fractal_runs
  drop constraint if exists fractal_runs_status_check;

alter table public.fractal_runs
  add constraint fractal_runs_status_check
  check (status in ('active', 'won', 'lost', 'abandoned'));

-- 2. Vincula a missão escolhida à run no momento em que ela começa.
-- Remove a assinatura anterior para não deixar sobrecarga ambígua no PostgREST.
drop function if exists public.start_fractal_run(integer, text, text, integer);
drop function if exists public.start_fractal_run(integer, text, text);

create function public.start_fractal_run(
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

-- 3. Liquidação com telemetria, missão conferida com a run e recompensa por mapa.
drop function if exists public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer, integer);
drop function if exists public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer);

create function public.finish_fractal_run_v2(
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

-- 4. Telemetria de expedições para o Painel do Mestre.
drop function if exists public.master_fractal_runs(integer);

create function public.master_fractal_runs(_limit integer default 50)
returns table(
  id uuid,
  username text,
  mission_id integer,
  corruption_level integer,
  weapon text,
  omen text,
  status text,
  game_seconds integer,
  kills integer,
  player_level integer,
  earned_fractals integer,
  started_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(auth.uid(), 'master') then
    raise exception 'Apenas o Mestre';
  end if;

  return query
  select
    r.id,
    p.username,
    coalesce(r.mission_id, 1) as mission_id,
    r.corruption_level,
    r.selected_weapon,
    r.selected_omen,
    r.status,
    r.game_seconds,
    r.kills,
    r.player_level,
    r.earned_fractals,
    r.started_at
  from public.fractal_runs r
  left join public.profiles p on p.id = r.user_id
  order by r.started_at desc
  limit least(greatest(coalesce(_limit, 50), 1), 200);
end;
$$;

revoke all on function public.master_fractal_runs(integer) from public, anon;
grant execute on function public.master_fractal_runs(integer) to authenticated;
