-- Jogo 21 (Blackjack): baralho, jogadas e liquidação controlados pelo banco.
-- O cliente nunca informa se venceu; a casa compra até 17 e também compra em 17 suave.

begin;

create table if not exists public.twentyone_games (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wager integer not null default 0 check (wager >= 0),
  payout integer not null default 0 check (payout >= 0),
  status text not null default 'active' check (status in ('active', 'won', 'lost', 'push')),
  player_cards jsonb not null default '[]'::jsonb,
  dealer_cards jsonb not null default '[]'::jsonb,
  deck jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint twentyone_games_result_consistency check (
    (status = 'active' and finished_at is null)
    or (status in ('won', 'lost', 'push') and finished_at is not null)
  )
);

create index if not exists twentyone_games_user_created_idx
  on public.twentyone_games(user_id, created_at desc);

create unique index if not exists twentyone_games_one_active_per_user_idx
  on public.twentyone_games(user_id)
  where status = 'active';

alter table public.twentyone_games enable row level security;
revoke all on public.twentyone_games from anon, authenticated;
grant all on public.twentyone_games to service_role;

comment on table public.twentyone_games is
  'Partidas de 21. Cartas, baralho e resultado ficam no servidor; clientes só usam RPCs autenticadas.';

create or replace function public._twentyone_hand(_cards jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_item jsonb;
  v_card text;
  v_rank text;
  v_total integer := 0;
  v_aces integer := 0;
  v_soft boolean := false;
begin
  for v_item in
    select element
    from pg_catalog.jsonb_array_elements(coalesce(_cards, '[]'::jsonb)) as items(element)
  loop
    v_card := v_item #>> '{}';
    v_rank := pg_catalog.split_part(v_card, '|', 1);

    if v_rank = 'A' then
      v_total := v_total + 1;
      v_aces := v_aces + 1;
    elsif v_rank in ('K', 'Q', 'J') then
      v_total := v_total + 10;
    elsif v_rank in ('2','3','4','5','6','7','8','9','10') then
      v_total := v_total + v_rank::integer;
    else
      raise exception 'Carta inválida no baralho';
    end if;
  end loop;

  if v_aces > 0 and v_total + 10 <= 21 then
    v_total := v_total + 10;
    v_soft := true;
  end if;

  return pg_catalog.jsonb_build_object(
    'total', v_total,
    'soft', v_soft,
    'bust', v_total > 21,
    'natural', pg_catalog.jsonb_array_length(coalesce(_cards, '[]'::jsonb)) = 2 and v_total = 21
  );
end;
$$;

create or replace function public._twentyone_state(_game public.twentyone_games)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', _game.id,
    'status', _game.status,
    'wager', _game.wager,
    'payout', _game.payout,
    'net', _game.payout - _game.wager,
    'profit', greatest(0, _game.payout - _game.wager),
    'playerCards', _game.player_cards,
    'dealerCards', case
      when _game.status = 'active'
        then pg_catalog.jsonb_build_array(_game.dealer_cards -> 0, 'BACK'::text)
      else _game.dealer_cards
    end,
    'playerTotal', (public._twentyone_hand(_game.player_cards) ->> 'total')::integer,
    'playerSoft', (_game.player_cards is not null and (public._twentyone_hand(_game.player_cards) ->> 'soft')::boolean),
    'dealerTotal', case
      when _game.status = 'active'
        then (public._twentyone_hand(pg_catalog.jsonb_build_array(_game.dealer_cards -> 0)) ->> 'total')::integer
      else (public._twentyone_hand(_game.dealer_cards) ->> 'total')::integer
    end,
    'dealerSoft', case
      when _game.status = 'active'
        then (public._twentyone_hand(pg_catalog.jsonb_build_array(_game.dealer_cards -> 0)) ->> 'soft')::boolean
      else (public._twentyone_hand(_game.dealer_cards) ->> 'soft')::boolean
    end,
    'deckRemaining', pg_catalog.jsonb_array_length(_game.deck),
    'dealerRule', 'Compra até 17, inclusive 17 suave'
  );
$$;

create or replace function public._twentyone_finish(
  _game public.twentyone_games,
  _outcome text,
  _dealer_cards jsonb
)
returns public.twentyone_games
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.twentyone_games;
  v_payout integer;
begin
  if auth.uid() is null or _game.user_id is distinct from auth.uid() then
    raise exception 'Partida não pertence ao jogador autenticado';
  end if;
  if _outcome not in ('won', 'lost', 'push') then
    raise exception 'Resultado inválido';
  end if;
  if _game.status <> 'active' then
    return _game;
  end if;

  v_payout := case
    when _outcome = 'won' then _game.wager * 2
    when _outcome = 'push' then _game.wager
    else 0
  end;

  if v_payout > 0 then
    update public.profiles
      set coins = coins + v_payout
      where id = auth.uid();

    insert into public.transactions(to_user, kind, coins, note)
    values (
      auth.uid(),
      case when _outcome = 'push' then 'empate 21' else 'prêmio 21' end,
      v_payout,
      case
        when _outcome = 'won'
          then pg_catalog.format('Vitória no 21: aposta de %s; prêmio total de %s moedas (dobro).', _game.wager, v_payout)
        else pg_catalog.format('Empate no 21: devolução da aposta de %s moedas.', _game.wager)
      end
    );
  end if;

  update public.twentyone_games
    set status = _outcome,
        dealer_cards = _dealer_cards,
        payout = v_payout,
        finished_at = now()
    where id = _game.id
      and user_id = auth.uid()
      and status = 'active'
    returning * into v_game;

  return v_game;
end;
$$;

create or replace function public.start_twentyone_game(_wager integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_balance integer;
  v_wager integer := coalesce(_wager, 0);
  v_cards text[] := array[]::text[];
  v_suit text;
  v_rank text;
  v_i integer;
  v_j integer;
  v_temp text;
  v_deck jsonb;
  v_card text;
  v_player_cards jsonb := '[]'::jsonb;
  v_dealer_cards jsonb := '[]'::jsonb;
  v_player_score jsonb;
  v_dealer_score jsonb;
  v_outcome text;
  v_active public.twentyone_games;
  v_game public.twentyone_games;
begin
  if v_user is null then
    raise exception 'Faça login para jogar 21';
  end if;
  if v_wager < 0 then
    raise exception 'A aposta não pode ser negativa';
  end if;

  select p.coins
    into v_balance
    from public.profiles p
    where p.id = v_user
    for update;

  if not found then
    raise exception 'Perfil do jogador não encontrado';
  end if;

  -- Reabrir uma partida ativa evita cobrar duas vezes após recarga ou perda de conexão.
  select *
    into v_active
    from public.twentyone_games
    where user_id = v_user
      and status = 'active'
    order by created_at desc
    limit 1
    for update;

  if found then
    return public._twentyone_state(v_active);
  end if;

  if v_wager > floor(v_balance / 2.0)::integer then
    raise exception 'A aposta máxima é metade do seu saldo atual';
  end if;

  -- Aposta e vigor são cobrados na mesma transação; qualquer erro reverte tudo.
  perform public._spend_vigor(case when v_wager > 0 then 3 else 1 end);

  if v_wager > 0 then
    update public.profiles
      set coins = coins - v_wager
      where id = v_user;

    insert into public.transactions(from_user, kind, coins, note)
    values (v_user, 'aposta 21', -v_wager, 'Aposta reservada ao iniciar o jogo 21');
  end if;

  -- Monta e embaralha um baralho padrão de 52 cartas no servidor.
  foreach v_suit in array array['S', 'H', 'D', 'C'] loop
    foreach v_rank in array array['A','2','3','4','5','6','7','8','9','10','J','Q','K'] loop
      v_cards := pg_catalog.array_append(v_cards, v_rank || '|' || v_suit);
    end loop;
  end loop;

  for v_i in reverse 52..2 loop
    v_j := 1 + floor(random() * v_i)::integer;
    v_temp := v_cards[v_i];
    v_cards[v_i] := v_cards[v_j];
    v_cards[v_j] := v_temp;
  end loop;

  v_deck := pg_catalog.to_jsonb(v_cards);

  -- Deal alternado: jogador, casa, jogador, casa.
  v_card := v_deck ->> 0;
  v_player_cards := v_player_cards || pg_catalog.jsonb_build_array(v_card);
  select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
    into v_deck
    from pg_catalog.jsonb_array_elements(v_deck) with ordinality as cards(card, ordinality)
    where ordinality > 1;

  v_card := v_deck ->> 0;
  v_dealer_cards := v_dealer_cards || pg_catalog.jsonb_build_array(v_card);
  select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
    into v_deck
    from pg_catalog.jsonb_array_elements(v_deck) with ordinality as cards(card, ordinality)
    where ordinality > 1;

  v_card := v_deck ->> 0;
  v_player_cards := v_player_cards || pg_catalog.jsonb_build_array(v_card);
  select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
    into v_deck
    from pg_catalog.jsonb_array_elements(v_deck) with ordinality as cards(card, ordinality)
    where ordinality > 1;

  v_card := v_deck ->> 0;
  v_dealer_cards := v_dealer_cards || pg_catalog.jsonb_build_array(v_card);
  select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
    into v_deck
    from pg_catalog.jsonb_array_elements(v_deck) with ordinality as cards(card, ordinality)
    where ordinality > 1;

  insert into public.twentyone_games(user_id, wager, player_cards, dealer_cards, deck)
  values (v_user, v_wager, v_player_cards, v_dealer_cards, v_deck)
  returning * into v_game;

  v_player_score := public._twentyone_hand(v_player_cards);
  v_dealer_score := public._twentyone_hand(v_dealer_cards);

  -- Blackjack natural is settled immediately; a natural tie returns the stake.
  if (v_player_score ->> 'natural')::boolean and (v_dealer_score ->> 'natural')::boolean then
    v_outcome := 'push';
  elsif (v_player_score ->> 'natural')::boolean then
    v_outcome := 'won';
  elsif (v_dealer_score ->> 'natural')::boolean then
    v_outcome := 'lost';
  else
    v_outcome := null;
  end if;

  if v_outcome is not null then
    v_game := public._twentyone_finish(v_game, v_outcome, v_dealer_cards);
  end if;

  return public._twentyone_state(v_game);
end;
$$;

create or replace function public.twentyone_hit(_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.twentyone_games;
  v_score jsonb;
  v_card text;
  v_deck jsonb;
  v_player_cards jsonb;
begin
  if auth.uid() is null then
    raise exception 'Faça login para jogar 21';
  end if;

  select *
    into v_game
    from public.twentyone_games
    where id = _game_id
      and user_id = auth.uid()
    for update;

  if not found then
    raise exception 'Partida não encontrada';
  end if;
  if v_game.status <> 'active' then
    return public._twentyone_state(v_game);
  end if;

  v_score := public._twentyone_hand(v_game.player_cards);
  if (v_score ->> 'total')::integer >= 21 then
    raise exception 'Sua mão já chegou a 21; escolha parar';
  end if;
  if pg_catalog.jsonb_array_length(v_game.deck) = 0 then
    raise exception 'O baralho acabou';
  end if;

  v_card := v_game.deck ->> 0;
  v_player_cards := v_game.player_cards || pg_catalog.jsonb_build_array(v_card);
  select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
    into v_deck
    from pg_catalog.jsonb_array_elements(v_game.deck) with ordinality as cards(card, ordinality)
    where ordinality > 1;

  update public.twentyone_games
    set player_cards = v_player_cards,
        deck = v_deck
    where id = v_game.id
    returning * into v_game;

  v_score := public._twentyone_hand(v_game.player_cards);
  if (v_score ->> 'total')::integer > 21 then
    v_game := public._twentyone_finish(v_game, 'lost', v_game.dealer_cards);
  end if;

  return public._twentyone_state(v_game);
end;
$$;

create or replace function public.twentyone_stand(_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.twentyone_games;
  v_player_score jsonb;
  v_dealer_score jsonb;
  v_dealer_cards jsonb;
  v_deck jsonb;
  v_card text;
  v_outcome text;
  v_dealer_total integer;
  v_dealer_soft boolean;
begin
  if auth.uid() is null then
    raise exception 'Faça login para jogar 21';
  end if;

  select *
    into v_game
    from public.twentyone_games
    where id = _game_id
      and user_id = auth.uid()
    for update;

  if not found then
    raise exception 'Partida não encontrada';
  end if;
  if v_game.status <> 'active' then
    return public._twentyone_state(v_game);
  end if;

  v_player_score := public._twentyone_hand(v_game.player_cards);
  if (v_player_score ->> 'total')::integer > 21 then
    return public._twentyone_state(public._twentyone_finish(v_game, 'lost', v_game.dealer_cards));
  end if;

  v_dealer_cards := v_game.dealer_cards;
  v_deck := v_game.deck;
  v_dealer_score := public._twentyone_hand(v_dealer_cards);
  v_dealer_total := (v_dealer_score ->> 'total')::integer;
  v_dealer_soft := (v_dealer_score ->> 'soft')::boolean;

  -- Strong house policy: hit every total below 17 and every soft 17.
  while (v_dealer_total < 17 or (v_dealer_total = 17 and v_dealer_soft))
    and pg_catalog.jsonb_array_length(v_deck) > 0
  loop
    v_card := v_deck ->> 0;
    v_dealer_cards := v_dealer_cards || pg_catalog.jsonb_build_array(v_card);
    select coalesce(pg_catalog.jsonb_agg(card order by ordinality), '[]'::jsonb)
      into v_deck
      from pg_catalog.jsonb_array_elements(v_deck) with ordinality as cards(card, ordinality)
      where ordinality > 1;

    v_dealer_score := public._twentyone_hand(v_dealer_cards);
    v_dealer_total := (v_dealer_score ->> 'total')::integer;
    v_dealer_soft := (v_dealer_score ->> 'soft')::boolean;
  end loop;

  if v_dealer_total > 21 or (v_player_score ->> 'total')::integer > v_dealer_total then
    v_outcome := 'won';
  elsif (v_player_score ->> 'total')::integer = v_dealer_total then
    v_outcome := 'push';
  else
    v_outcome := 'lost';
  end if;

  update public.twentyone_games
    set deck = v_deck
    where id = v_game.id;
  select * into v_game from public.twentyone_games where id = v_game.id;

  v_game := public._twentyone_finish(v_game, v_outcome, v_dealer_cards);
  return public._twentyone_state(v_game);
end;
$$;

create or replace function public.get_active_twentyone_game()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game public.twentyone_games;
begin
  if auth.uid() is null then
    raise exception 'Faça login para consultar a partida';
  end if;

  select *
    into v_game
    from public.twentyone_games
    where user_id = auth.uid()
      and status = 'active'
    order by created_at desc
    limit 1;

  if not found then
    return null;
  end if;

  return public._twentyone_state(v_game);
end;
$$;

revoke all on function public._twentyone_hand(jsonb) from public, anon, authenticated;
revoke all on function public._twentyone_state(public.twentyone_games) from public, anon, authenticated;
revoke all on function public._twentyone_finish(public.twentyone_games, text, jsonb) from public, anon, authenticated;
revoke all on function public.start_twentyone_game(integer) from public, anon;
revoke all on function public.twentyone_hit(uuid) from public, anon;
revoke all on function public.twentyone_stand(uuid) from public, anon;
revoke all on function public.get_active_twentyone_game() from public, anon;
grant execute on function public.start_twentyone_game(integer) to authenticated;
grant execute on function public.twentyone_hit(uuid) to authenticated;
grant execute on function public.twentyone_stand(uuid) to authenticated;
grant execute on function public.get_active_twentyone_game() to authenticated;

commit;

-- Smoke checks after applying this migration in the app's own SQL editor:
-- select to_regclass('public.twentyone_games');
-- select proname from pg_proc join pg_namespace n on n.oid=pronamespace
-- where n.nspname='public' and proname in
-- ('start_twentyone_game','twentyone_hit','twentyone_stand','get_active_twentyone_game');
