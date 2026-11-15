-- Ecos dos Fractais: Lança de Sangue e Pentagrama Carmesim.
-- Desbloqueio, projeto de evolução, validação da arma no início da run e maestria.
-- Execute manualmente no SQL Editor do Supabase depois de publicar o código.

begin;

create or replace function public.purchase_blood_spear_upgrade(_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
  upgrades jsonb;
  price integer;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _upgrade is null or _upgrade not in ('weapon_blood_spear', 'evolution_blood_spear') then
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

  if coalesce((upgrades ->> _upgrade)::boolean, false) then
    raise exception 'Esta melhoria já foi comprada';
  end if;

  if _upgrade = 'evolution_blood_spear'
    and not coalesce((upgrades ->> 'mastery_blood_spear')::boolean, false)
    and not master_access then
    raise exception 'Conclua uma expedição vitoriosa com a Lança de Sangue para liberar seu projeto';
  end if;

  price := case _upgrade
    when 'weapon_blood_spear' then 15000
    when 'evolution_blood_spear' then 5000
    else null
  end;

  if price is null then raise exception 'Preço da melhoria não configurado'; end if;
  if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;

  update public.fractal_player_state
  set fractals = case when master_access then fractals else fractals - price end,
      purchased_upgrades = pg_catalog.jsonb_set(upgrades, array[_upgrade], 'true'::jsonb, true),
      updated_at = pg_catalog.now()
  where user_id = auth.uid();

  return public.get_fractal_state();
end;
$$;

revoke all on function public.purchase_blood_spear_upgrade(text) from public, anon;
grant execute on function public.purchase_blood_spear_upgrade(text) to authenticated;

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

  -- Uma conta mantém apenas uma expedição ativa. Runs abandonadas por falha
  -- de conexão são encerradas após 15 minutos de relógio real.
  update public.fractal_runs
  set status = 'abandoned',
      finished_at = coalesce(finished_at, pg_catalog.now())
  where user_id = auth.uid()
    and status = 'active'
    and started_at < pg_catalog.now() - interval '15 minutes';

  if exists (
    select 1
    from public.fractal_runs
    where user_id = auth.uid()
      and status = 'active'
  ) then
    raise exception 'Você já possui uma expedição ativa. Finalize ou abandone a expedição atual antes de iniciar outra.';
  end if;

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
    when 'blood_spear' then 'weapon_blood_spear'
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
    elsif new.selected_weapon = 'blood_spear' then
      update public.fractal_player_state
      set purchased_upgrades = pg_catalog.jsonb_set(
        coalesce(purchased_upgrades, '{}'::jsonb),
        '{mastery_blood_spear}',
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

-- Inicializa somente as três chaves novas e preserva todo o progresso existente.
update public.fractal_player_state
set purchased_upgrades = coalesce(purchased_upgrades, '{}'::jsonb) || jsonb_build_object(
  'weapon_blood_spear', coalesce(purchased_upgrades -> 'weapon_blood_spear', 'false'::jsonb),
  'mastery_blood_spear', coalesce(purchased_upgrades -> 'mastery_blood_spear', 'false'::jsonb),
  'evolution_blood_spear', coalesce(purchased_upgrades -> 'evolution_blood_spear', 'false'::jsonb)
);

commit;
