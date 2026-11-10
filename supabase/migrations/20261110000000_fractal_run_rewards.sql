-- Ecos dos Fractais — economia de recompensas por expedição.
-- A execução é transacional: bloqueia a run e o estado do jogador, credita uma única vez
-- e devolve o saldo atualizado junto com earnedFractals.
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
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _victory is null then
    raise exception 'Resultado da expedição inválido';
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

  if r.status <> 'active' then
    raise exception 'Esta expedição já foi encerrada';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role::text = 'master'
  )
  into master_access;

  -- Apenas mestres podem validar uma vitória antes dos 10 minutos mínimos.
  if _victory
    and not master_access
    and pg_catalog.now() < r.started_at + interval '10 minutes'
  then
    raise exception 'A expedição ainda não atingiu o tempo mínimo para validar o guardião';
  end if;

  -- Limita o tempo recompensável à duração máxima da expedição (12 minutos).
  survived_minutes := greatest(
    0,
    floor(
      extract(epoch from (
        least(pg_catalog.now(), r.started_at + interval '12 minutes') - r.started_at
      )) / 60
    )::integer
  );

  if _victory then
    earned_fractals := 25 + (r.corruption_level * 15);
  elsif survived_minutes >= 2 then
    earned_fractals := survived_minutes * (2 + r.corruption_level);
  end if;

  -- O bloqueio da run e a condição status='active' impedem crédito duplicado.
  update public.fractal_runs
  set status = case when _victory then 'won' else 'lost' end,
      finished_at = pg_catalog.now()
  where id = _run_id;

  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select *
  into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  if _victory then
    update public.fractal_player_state
    set fractals = fractals + earned_fractals,
        completed_corruptions = array(
          select distinct completed.level
          from pg_catalog.unnest(s.completed_corruptions || r.corruption_level) as completed(level)
          order by completed.level
        ),
        corruption_unlocked = greatest(
          corruption_unlocked,
          least(5, r.corruption_level + 1)
        ),
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
