-- Personalização da arte dos monstros e custo correto de vigor no Farkle.
-- Sem aposta: 1 vigor. Com aposta: 3 vigor.
begin;

alter table public.monsters
  add column if not exists image_url text;

comment on column public.monsters.image_url is
  'URL ou caminho público da imagem personalizada definida pelo Mestre para este monstro.';

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

  -- A cobrança é atômica: se não houver vigor, toda a operação é revertida.
  perform public._spend_vigor(case when v_wager > 0 then 3 else 1 end);

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

  -- Fecha reservas antigas que ficaram ativas após sair/recarregar a página.
  update public.farkle_games
    set status = 'lost',
        result_won = false,
        finished_at = now()
    where user_id = auth.uid()
      and status = 'active';

  insert into public.farkle_games(user_id, wager)
  values (auth.uid(), v_wager)
  returning id into v_game_id;

  return v_game_id;
end;
$$;

revoke execute on function public.start_farkle_game_with_bet(integer) from public, anon;
grant execute on function public.start_farkle_game_with_bet(integer) to authenticated;

commit;

-- Verificação após a execução:
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'monsters'
--   and column_name = 'image_url';
--
-- select pg_get_functiondef(
--   'public.start_farkle_game_with_bet(integer)'::regprocedure
-- );
