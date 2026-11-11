-- Ecos dos Fractais: three projectile behavior relics.
-- Apply in Supabase SQL Editor before purchasing the new relics.

alter table public.fractal_player_state
  alter column purchased_upgrades set default
    '{"area":0,"experience":0,"rarity":0,"speed_2x":false,"speed_3x":false,"health":0,"projectile_duration":0,"projectile_range":0,"projectiles":0,"ricochet":0,"piercing":0,"chain_lightning":0}'::jsonb;

update public.fractal_player_state
set purchased_upgrades = coalesce(purchased_upgrades, '{}'::jsonb) ||
  '{"ricochet":0,"piercing":0,"chain_lightning":0}'::jsonb;

create or replace function public.purchase_fractal_upgrade(_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
  current_level integer;
  next_level integer;
  max_level integer;
  price integer;
  upgrades jsonb;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _upgrade not in (
    'area','experience','rarity','speed_2x','speed_3x',
    'health','projectile_duration','projectile_range','projectiles',
    'ricochet','piercing','chain_lightning'
  ) then
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

  if _upgrade in (
    'area','experience','rarity','projectile_range','projectiles',
    'health','projectile_duration','ricochet','piercing','chain_lightning'
  ) then
    current_level := coalesce((upgrades->>_upgrade)::integer, 0);
    next_level := current_level + 1;
    max_level := case when _upgrade = 'health' then 5 else 3 end;

    if next_level > max_level then
      raise exception 'Esta melhoria já está no nível máximo';
    end if;

    price := case _upgrade
      when 'area' then (array[300,600,1000])[next_level]
      when 'experience' then (array[250,500,900])[next_level]
      when 'rarity' then (array[400,800,1400])[next_level]
      when 'health' then (array[500,800,1200,1700,2300])[next_level]
      when 'projectile_duration' then (array[600,1000,1600])[next_level]
      when 'projectile_range' then (array[350,600,1000])[next_level]
      when 'projectiles' then (array[700,1200,1800])[next_level]
      when 'ricochet' then (array[500,900,1400])[next_level]
      when 'piercing' then (array[600,1000,1500])[next_level]
      when 'chain_lightning' then (array[700,1200,1800])[next_level]
    end;

    if s.fractals < price and not master_access then
      raise exception 'Fractais insuficientes';
    end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], to_jsonb(next_level), true),
        updated_at = now()
    where user_id = auth.uid();
  else
    if coalesce((upgrades->>_upgrade)::boolean,false) then
      raise exception 'Esta melhoria já foi comprada';
    end if;

    if _upgrade = 'speed_3x'
      and not coalesce((upgrades->>'speed_2x')::boolean,false)
      and not master_access then
      raise exception 'Compre primeiro a velocidade 2x';
    end if;

    price := case when _upgrade='speed_2x' then 1000 else 2000 end;

    if s.fractals < price and not master_access then
      raise exception 'Fractais insuficientes';
    end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], 'true'::jsonb, true),
        updated_at = now()
    where user_id = auth.uid();
  end if;

  return public.get_fractal_state();
end;
$$;

revoke all on function public.purchase_fractal_upgrade(text) from public, anon;
grant execute on function public.purchase_fractal_upgrade(text) to authenticated;
