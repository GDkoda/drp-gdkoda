-- Ecos dos Fractais: exclusividade de expedição por jogador.
-- Esta migration encerra duplicatas legadas, impede novas runs paralelas e
-- desativa a RPC de liquidação v1, substituída por finish_fractal_run_v2.
-- Observação: isto não transforma a simulação client-side em simulação autoritativa.

begin;

-- Corrige dados antigos antes de instalar a restrição de unicidade.
with ranked_active_runs as (
  select
    id,
    started_at,
    row_number() over (
      partition by user_id
      order by started_at desc, id desc
    ) as active_rank
  from public.fractal_runs
  where status = 'active'
)
update public.fractal_runs r
set status = 'abandoned',
    finished_at = coalesce(r.finished_at, pg_catalog.now())
from ranked_active_runs ranked
where r.id = ranked.id
  and (
    ranked.active_rank > 1
    or ranked.started_at < pg_catalog.now() - interval '15 minutes'
  );

create unique index if not exists fractal_runs_one_active_per_user_idx
  on public.fractal_runs (user_id)
  where status = 'active';

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

-- A versão v1 recebia apenas run_id e victory; não é chamada pelo cliente atual.
-- Revogar impede que continue sendo usada como caminho alternativo de liquidação.
revoke all on function public.finish_fractal_run(uuid, boolean) from public, anon, authenticated;

commit;
