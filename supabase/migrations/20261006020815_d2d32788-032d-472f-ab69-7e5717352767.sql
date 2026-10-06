alter table public.game_settings add column if not exists vigor_cost_1 integer not null default 10, add column if not exists vigor_cost_5 integer not null default 45;
alter table public.profiles alter column vigor_date set default ((now() at time zone 'America/Sao_Paulo')::date);

create or replace function public._br_today() returns date language sql stable set search_path to 'public' as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public._spend_vigor(_n integer) returns void language plpgsql security definer set search_path to 'public' as $$
declare mx int;
begin
  select vigor_daily into mx from game_settings where id=1;
  update profiles set vigor = greatest(vigor, mx), vigor_date = _br_today() where id = auth.uid() and vigor_date < _br_today();
  update profiles set vigor = vigor - _n where id = auth.uid() and vigor >= _n;
  if not found then raise exception 'Vigor insuficiente. Renova à meia-noite (Brasília)!'; end if;
end $$;

create or replace function public.get_vigor() returns integer language plpgsql security definer set search_path to 'public' as $$
declare v int; mx int;
begin
  select vigor_daily into mx from game_settings where id=1;
  update profiles set vigor = greatest(vigor, mx), vigor_date = _br_today() where id = auth.uid() and vigor_date < _br_today();
  select vigor into v from profiles where id = auth.uid();
  return v;
end $$;

create or replace function public.master_adjust_vigor(_user uuid, _delta integer) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not has_role(auth.uid(),'master') then raise exception 'Apenas o Mestre'; end if;
  update profiles set vigor = greatest(0, vigor + _delta), vigor_date = greatest(vigor_date, _br_today()) where id=_user;
  insert into transactions(from_user,to_user,kind,coins,note) values (auth.uid(),_user,'ajuste de vigor',0,(case when _delta>0 then '+' else '' end)||_delta||' vigor');
end $$;

create or replace function public.restore_vigor(_amount integer) returns integer language plpgsql security definer set search_path to 'public' as $$
declare s game_settings; cost int; bal int; v int;
begin
  if _amount not in (1,5) then raise exception 'Quantidade inválida'; end if;
  select * into s from game_settings where id=1;
  cost := case when _amount=1 then s.vigor_cost_1 else s.vigor_cost_5 end;
  perform get_vigor();
  select coins, vigor into bal, v from profiles where id=auth.uid() for update;
  if v + _amount > s.vigor_daily then raise exception 'Vigor já está quase cheio (máx. %)', s.vigor_daily; end if;
  if bal < cost then raise exception 'Moedas insuficientes'; end if;
  update profiles set coins = coins - cost, vigor = vigor + _amount where id=auth.uid();
  insert into transactions(from_user,kind,coins,note) values (auth.uid(),'restaurar vigor',cost,'+'||_amount||' vigor');
  return v + _amount;
end $$;
revoke execute on function public.restore_vigor(integer) from public, anon;
grant execute on function public.restore_vigor(integer) to authenticated;
revoke execute on function public._br_today() from public, anon;
grant execute on function public._br_today() to authenticated;