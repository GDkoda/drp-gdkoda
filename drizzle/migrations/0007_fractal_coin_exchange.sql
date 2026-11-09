-- Ecos dos Fractais — conversão segura de fractais em moedas.
-- Executar depois de 0005_fractal_shop_state.sql e 0006_fractal_shop_attributes_and_specials.sql.
-- A conversão é feita no servidor, em uma única transação, sem confiar no saldo enviado pelo cliente.

create or replace function public.get_fractal_state()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  profile_coins integer;
  master_access boolean;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select *
  into s
  from public.fractal_player_state
  where user_id = auth.uid();

  select coalesce(p.coins, 0)
  into profile_coins
  from public.profiles p
  where p.id = auth.uid();

  if not found then
    raise exception 'Perfil do jogador não encontrado';
  end if;

  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role::text = 'master'
  )
  into master_access;

  return jsonb_build_object(
    'fractals', s.fractals,
    'coins', profile_coins,
    'corruptionUnlocked', s.corruption_unlocked,
    'completedCorruptions', to_jsonb(s.completed_corruptions),
    'purchasedUpgrades', s.purchased_upgrades,
    'isMaster', master_access
  );
end;
$$;

create or replace function public.exchange_fractals_for_coins(_fractals integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  current_coins integer;
  coins_to_add integer;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _fractals is null or _fractals < 10 or mod(_fractals, 10) <> 0 then
    raise exception 'A quantidade deve ser um múltiplo de 10 fractais';
  end if;

  coins_to_add := _fractals / 10;

  -- Bloqueia o saldo de fractais para impedir gastos simultâneos concorrentes.
  insert into public.fractal_player_state(user_id)
  values (auth.uid())
  on conflict (user_id) do nothing;

  select *
  into s
  from public.fractal_player_state
  where user_id = auth.uid()
  for update;

  if s.fractals < _fractals then
    raise exception 'Fractais insuficientes';
  end if;

  -- Bloqueia o perfil e protege também contra overflow do saldo inteiro de moedas.
  select coalesce(p.coins, 0)
  into current_coins
  from public.profiles p
  where p.id = auth.uid()
  for update;

  if not found then
    raise exception 'Perfil do jogador não encontrado';
  end if;

  if current_coins > 2147483647 - coins_to_add then
    raise exception 'O saldo de moedas atingiria o limite permitido';
  end if;

  update public.fractal_player_state
  set fractals = fractals - _fractals,
      updated_at = now()
  where user_id = auth.uid();

  update public.profiles
  set coins = coalesce(coins, 0) + coins_to_add
  where id = auth.uid();

  return public.get_fractal_state();
end;
$$;

revoke all on function public.get_fractal_state() from public, anon;
revoke all on function public.exchange_fractals_for_coins(integer) from public, anon;
grant execute on function public.get_fractal_state() to authenticated;
grant execute on function public.exchange_fractals_for_coins(integer) to authenticated;
