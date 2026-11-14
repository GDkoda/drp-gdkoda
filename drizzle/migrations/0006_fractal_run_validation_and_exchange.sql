alter table public.fractal_runs add column if not exists game_seconds integer;
alter table public.fractal_runs add column if not exists kills integer;
alter table public.fractal_runs add column if not exists player_level integer;
alter table public.fractal_runs add column if not exists earned_fractals integer;

create index if not exists fractal_runs_user_active_idx on public.fractal_runs(user_id) where status = 'active';

-- Uma expedição ativa por conta: inícios novos encerram as anteriores sem recompensa.
create or replace function public._close_previous_fractal_runs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.fractal_runs set status = 'abandoned', finished_at = pg_catalog.now()
  where user_id = new.user_id and status = 'active' and id <> new.id;
  return new;
end; $$;
drop trigger if exists fractal_runs_single_active on public.fractal_runs;
create trigger fractal_runs_single_active before insert on public.fractal_runs
for each row execute function public._close_previous_fractal_runs();

-- Validação por tempo de jogo + abates, compatível com aceleração 2x/3x.
create or replace function public.finish_fractal_run_v2(_run_id uuid, _victory boolean, _game_seconds integer, _kills integer, _level integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.fractal_runs; s public.fractal_player_state;
  master_access boolean; max_speed integer := 1; real_seconds numeric;
  gs integer; k integer; lvl integer; minutes integer; earned integer := 0;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _victory is null then raise exception 'Resultado da expedição inválido'; end if;
  select * into r from public.fractal_runs where id = _run_id and user_id = auth.uid() for update;
  if not found then raise exception 'Expedição não encontrada'; end if;
  if r.status <> 'active' then
    if r.status in ('won','lost') then
      return public.get_fractal_state() || pg_catalog.jsonb_build_object('earnedFractals', coalesce(r.earned_fractals,0), 'alreadySettled', true);
    end if;
    raise exception 'Esta expedição foi encerrada porque outra foi iniciada';
  end if;
  select exists(select 1 from public.user_roles where user_id = auth.uid() and role::text = 'master') into master_access;
  insert into public.fractal_player_state(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id = auth.uid() for update;
  if coalesce((s.purchased_upgrades->>'speed_3x')::boolean,false) then max_speed := 3;
  elsif coalesce((s.purchased_upgrades->>'speed_2x')::boolean,false) then max_speed := 2; end if;
  real_seconds := extract(epoch from (pg_catalog.now() - r.started_at));
  gs := greatest(0, least(coalesce(_game_seconds,0), 720));
  -- Tempo de jogo não pode exceder o relógio real × velocidade comprada (+ folga de 15 s).
  if not master_access then gs := least(gs, floor(real_seconds * max_speed + 15)::integer); end if;
  k := greatest(0, least(coalesce(_kills,0), gs * 6));
  lvl := greatest(1, least(coalesce(_level,1), 200));
  if _victory and not master_access and gs < 600 then
    raise exception 'A expedição ainda não atingiu o tempo de jogo necessário para validar o guardião';
  end if;
  minutes := gs / 60;
  if _victory then earned := 25 + r.corruption_level * 15;
  elsif minutes >= 2 then
    -- Derrota paga por minuto apenas se houve combate real (≥ 8 abates por minuto pago).
    earned := least(minutes, k / 8) * (2 + r.corruption_level);
  end if;
  update public.fractal_runs set status = case when _victory then 'won' else 'lost' end,
    finished_at = pg_catalog.now(), game_seconds = gs, kills = k, player_level = lvl, earned_fractals = earned
  where id = _run_id;
  if _victory then
    update public.fractal_player_state set fractals = fractals + earned,
      completed_corruptions = array(select distinct c.level from pg_catalog.unnest(s.completed_corruptions || r.corruption_level) as c(level) order by c.level),
      corruption_unlocked = greatest(corruption_unlocked, least(5, r.corruption_level + 1)), updated_at = pg_catalog.now()
    where user_id = auth.uid();
  elsif earned > 0 then
    update public.fractal_player_state set fractals = fractals + earned, updated_at = pg_catalog.now() where user_id = auth.uid();
  end if;
  return public.get_fractal_state() || pg_catalog.jsonb_build_object('earnedFractals', earned);
end; $$;
revoke all on function public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer) from public, anon;
grant execute on function public.finish_fractal_run_v2(uuid, boolean, integer, integer, integer) to authenticated;
revoke execute on function public.finish_fractal_run(uuid, boolean) from authenticated;
comment on function public.finish_fractal_run(uuid, boolean) is 'DEPRECATED: replaced by finish_fractal_run_v2';

-- Câmbio: 1000 FR = 1 moeda.
create or replace function public.exchange_fractals_for_coins(_fractals integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.fractal_player_state; current_coins integer; coins_to_add integer;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _fractals is null or _fractals < 1000 or mod(_fractals, 1000) <> 0 then
    raise exception 'A quantidade deve ser um múltiplo de 1.000 fractais';
  end if;
  coins_to_add := _fractals / 1000;
  insert into public.fractal_player_state(user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * into s from public.fractal_player_state where user_id = auth.uid() for update;
  if s.fractals < _fractals then raise exception 'Fractais insuficientes'; end if;
  select coalesce(p.coins,0) into current_coins from public.profiles p where p.id = auth.uid() for update;
  if not found then raise exception 'Perfil do jogador não encontrado'; end if;
  if current_coins > 2147483647 - coins_to_add then raise exception 'O saldo de moedas atingiria o limite permitido'; end if;
  update public.fractal_player_state set fractals = fractals - _fractals, updated_at = now() where user_id = auth.uid();
  update public.profiles set coins = coalesce(coins,0) + coins_to_add where id = auth.uid();
  return public.get_fractal_state();
end; $$;

-- Telemetria para o Mestre.
create or replace function public.master_fractal_runs(_limit integer default 50)
returns table(id uuid, username text, corruption_level integer, weapon text, omen text, status text, game_seconds integer, kills integer, player_level integer, earned_fractals integer, started_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.has_role(auth.uid(), 'master') then raise exception 'Apenas o Mestre'; end if;
  return query select r.id, p.username, r.corruption_level, r.selected_weapon, r.selected_omen, r.status, r.game_seconds, r.kills, r.player_level, r.earned_fractals, r.started_at
  from public.fractal_runs r left join public.profiles p on p.id = r.user_id
  order by r.started_at desc limit least(greatest(coalesce(_limit,50),1),200);
end; $$;
revoke all on function public.master_fractal_runs(integer) from public, anon;
grant execute on function public.master_fractal_runs(integer) to authenticated;