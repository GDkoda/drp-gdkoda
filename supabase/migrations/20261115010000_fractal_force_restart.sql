-- Permite ao jogador escolher, com confirmação explícita, encerrar uma expedição antiga
-- antes de iniciar outra. Sem confirmação, a rotina preserva a run ativa e retorna
-- um marcador estável para a interface abrir o diálogo de confirmação.

drop function if exists public.start_fractal_run(integer, text, text, integer);

create function public.start_fractal_run(
  _corruption integer,
  _weapon text default 'void_revolver',
  _omen text default null,
  _mission_id integer default 1,
  _force_restart boolean default false
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
  has_active_run boolean;
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

  if _mission_id <> 1 then
    raise exception 'Esta missão ainda está bloqueada';
  end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  -- Serializa inícios concorrentes do mesmo jogador.
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

  select exists (
    select 1
    from public.fractal_runs
    where user_id = auth.uid()
      and status = 'active'
  )
  into has_active_run;

  if has_active_run and not coalesce(_force_restart, false) then
    raise exception 'ACTIVE_FRACTAL_RUN: já existe uma expedição ativa para esta conta';
  end if;

  if has_active_run and coalesce(_force_restart, false) then
    update public.fractal_runs
    set status = 'abandoned',
        finished_at = pg_catalog.now()
    where user_id = auth.uid()
      and status = 'active';
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

revoke all on function public.start_fractal_run(integer, text, text, integer, boolean) from public, anon;
grant execute on function public.start_fractal_run(integer, text, text, integer, boolean) to authenticated;
