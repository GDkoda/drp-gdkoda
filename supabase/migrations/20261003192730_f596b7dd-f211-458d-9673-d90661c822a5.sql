create or replace function public.use_consumable(_chest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c chest_items; ch uuid; mx int;
begin
  select * into c from chest_items where id=_chest and owner_id=auth.uid() and category='consumivel';
  if not found then raise exception 'Item não encontrado'; end if;
  select active_character_id into ch from profiles where id=auth.uid();
  if ch is null or not exists (select 1 from characters where id=ch and owner_id=auth.uid()) then raise exception 'Defina uma ficha ativa'; end if;
  select r*5 into mx from characters where id=ch;
  update characters set
    pv_current = least(mx, pv_current + coalesce((c.bonus->>'pv')::int,0)),
    pm_current = least(mx, pm_current + coalesce((c.bonus->>'pm')::int,0))
  where id=ch;
  delete from chest_items where id=_chest;
end $$;
revoke execute on function public.use_consumable(uuid) from public, anon;
grant execute on function public.use_consumable(uuid) to authenticated;