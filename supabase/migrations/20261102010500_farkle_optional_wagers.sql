-- Apostas opcionais do Jogo de Dados (Farkle).
-- O valor é reservado no início e liquidado uma única vez ao encerrar a partida.

create table public.farkle_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wager integer not null default 0 check (wager >= 0),
  status text not null default 'active' check (status in ('active', 'won', 'lost')),
  result_won boolean,
  payout integer not null default 0 check (payout >= 0),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint farkle_games_result_consistency check (
    (status = 'active' and result_won is null and finished_at is null)
    or (status in ('won', 'lost') and result_won is not null and finished_at is not null)
  )
);

create index farkle_games_user_created_idx
  on public.farkle_games(user_id, created_at desc);

alter table public.farkle_games enable row level security;
revoke all on public.farkle_games from anon, authenticated;
grant all on public.farkle_games to service_role;

-- Debita 3 de vigor e reserva a aposta no mesmo commit.
-- A aposta é opcional (0), e nunca pode ultrapassar metade do saldo atual.
create or replace function public.start_farkle_game_with_bet(_wager integer)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_wager integer := coalesce(_wager, 0);
  v_game_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login para iniciar uma partida';
  end if;
  if v_wager < 0 then
    raise exception 'A aposta não pode ser negativa';
  end if;

  select p.coins
    into v_balance
    from public.profiles p
    where p.id = auth.uid()
    for update;

  if not found then
    raise exception 'Perfil do jogador não encontrado';
  end if;
  if v_wager > greatest(0, floor(v_balance / 2.0)::integer) then
    raise exception 'A aposta máxima é 50%% do seu saldo atual';
  end if;

  -- Se não houver vigor, a exceção desfaz também qualquer alteração desta chamada.
  perform public._spend_vigor(3);

  if v_wager > 0 then
    update public.profiles
      set coins = coins - v_wager
      where id = auth.uid();

    insert into public.transactions(from_user, kind, coins, note)
    values (
      auth.uid(),
      'aposta Farkle',
      -v_wager,
      'Aposta opcional reservada no início da partida'
    );
  end if;

  insert into public.farkle_games(user_id, wager)
  values (auth.uid(), v_wager)
  returning id into v_game_id;

  return v_game_id;
end;
$$;

revoke execute on function public.start_farkle_game_with_bet(integer) from public, anon;
grant execute on function public.start_farkle_game_with_bet(integer) to authenticated;

-- A reserva só pode ser liquidada pelo dono e uma única vez.
-- Na vitória, o valor apostado é devolvido e soma-se 50% de lucro
-- (arredondado para baixo quando a aposta é ímpar). Na derrota não há devolução.
create or replace function public.finish_farkle_game(_game uuid, _won boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.farkle_games%rowtype;
  v_payout integer;
  v_profit integer;
begin
  if auth.uid() is null then
    raise exception 'Faça login para concluir a partida';
  end if;
  if _won is null then
    raise exception 'Resultado da partida inválido';
  end if;

  select *
    into v_game
    from public.farkle_games
    where id = _game
      and user_id = auth.uid()
    for update;

  if not found then
    raise exception 'Partida não encontrada';
  end if;

  -- Permite repetir uma chamada que perdeu a resposta de rede sem pagar duas vezes.
  if v_game.status <> 'active' then
    if v_game.result_won is distinct from _won then
      raise exception 'Esta partida já foi liquidada';
    end if;
    return jsonb_build_object(
      'wager', v_game.wager,
      'payout', v_game.payout,
      'profit', greatest(0, v_game.payout - v_game.wager),
      'net', v_game.payout - v_game.wager,
      'won', v_game.result_won
    );
  end if;

  v_payout := case
    when _won then v_game.wager + (v_game.wager / 2)
    else 0
  end;
  v_profit := greatest(0, v_payout - v_game.wager);

  if v_payout > 0 then
    update public.profiles
      set coins = coins + v_payout
      where id = auth.uid();

    insert into public.transactions(to_user, kind, coins, note)
    values (
      auth.uid(),
      'prêmio Farkle',
      v_payout,
      format('Aposta de %s moedas devolvida; lucro de %s moedas', v_game.wager, v_profit)
    );
  end if;

  update public.farkle_games
    set status = case when _won then 'won' else 'lost' end,
        result_won = _won,
        payout = v_payout,
        finished_at = now()
    where id = v_game.id;

  return jsonb_build_object(
    'wager', v_game.wager,
    'payout', v_payout,
    'profit', v_profit,
    'net', v_payout - v_game.wager,
    'won', _won
  );
end;
$$;

revoke execute on function public.finish_farkle_game(uuid, boolean) from public, anon;
grant execute on function public.finish_farkle_game(uuid, boolean) to authenticated;
