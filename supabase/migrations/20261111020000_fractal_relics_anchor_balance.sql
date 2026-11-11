-- Ecos dos Fractais: novos limites, níveis de Âncora, Oráculo e Fortuna.
-- Execute depois de 20261111010000_fractal_progression_weapons_and_omens.sql.
-- Preserva as compras numéricas válidas já existentes e normaliza booleanos antigos.

begin;

alter table public.fractal_player_state
  alter column purchased_upgrades set default '{
  "area":0,"experience":0,"rarity":0,"speed_2x":false,"speed_3x":false,
  "health":0,"projectile_duration":0,"projectile_range":0,"projectiles":0,
  "ricochet":0,"piercing":0,"chain_lightning":0,
  "reroll":0,"oracle":0,"banish":0,"fortune":0,"transmutation":0,
  "anchor_soul":0,"omen_archive":false,
  "weapon_nucleus":false,"weapon_scythe":false,"weapon_orbitals":false,"weapon_gravity":false,"weapon_sentinels":false,
  "mastery_void_revolver":false,"mastery_nucleus":false,"mastery_scythe":false,"mastery_orbitals":false,"mastery_gravity":false,"mastery_sentinels":false,
  "evolution_void_revolver":false,"evolution_nucleus":false,"evolution_scythe":false,"evolution_orbitals":false,"evolution_gravity":false,"evolution_sentinels":false
}'::jsonb;

update public.fractal_player_state
set purchased_upgrades =
  '{
  "area":0,"experience":0,"rarity":0,"speed_2x":false,"speed_3x":false,
  "health":0,"projectile_duration":0,"projectile_range":0,"projectiles":0,
  "ricochet":0,"piercing":0,"chain_lightning":0,
  "reroll":0,"oracle":0,"banish":0,"fortune":0,"transmutation":0,
  "anchor_soul":0,"omen_archive":false,
  "weapon_nucleus":false,"weapon_scythe":false,"weapon_orbitals":false,"weapon_gravity":false,"weapon_sentinels":false,
  "mastery_void_revolver":false,"mastery_nucleus":false,"mastery_scythe":false,"mastery_orbitals":false,"mastery_gravity":false,"mastery_sentinels":false,
  "evolution_void_revolver":false,"evolution_nucleus":false,"evolution_scythe":false,"evolution_orbitals":false,"evolution_gravity":false,"evolution_sentinels":false
}'::jsonb
  || coalesce(purchased_upgrades, '{}'::jsonb)
  || jsonb_build_object(
  'area', case when pg_catalog.jsonb_typeof(purchased_upgrades->'area') = 'number' then greatest(0, (purchased_upgrades->>'area')::integer) else 0 end,
  'experience', case when pg_catalog.jsonb_typeof(purchased_upgrades->'experience') = 'number' then greatest(0, (purchased_upgrades->>'experience')::integer) else 0 end,
  'rarity', case when pg_catalog.jsonb_typeof(purchased_upgrades->'rarity') = 'number' then greatest(0, (purchased_upgrades->>'rarity')::integer) else 0 end,
  'health', case when pg_catalog.jsonb_typeof(purchased_upgrades->'health') = 'number' then greatest(0, (purchased_upgrades->>'health')::integer) else 0 end,
  'projectile_duration', case when pg_catalog.jsonb_typeof(purchased_upgrades->'projectile_duration') = 'number' then greatest(0, (purchased_upgrades->>'projectile_duration')::integer) else 0 end,
  'projectile_range', case when pg_catalog.jsonb_typeof(purchased_upgrades->'projectile_range') = 'number' then greatest(0, (purchased_upgrades->>'projectile_range')::integer) else 0 end,
  'projectiles', case when pg_catalog.jsonb_typeof(purchased_upgrades->'projectiles') = 'number' then greatest(0, (purchased_upgrades->>'projectiles')::integer) else 0 end,
  'ricochet', case when pg_catalog.jsonb_typeof(purchased_upgrades->'ricochet') = 'number' then greatest(0, (purchased_upgrades->>'ricochet')::integer) else 0 end,
  'piercing', case when pg_catalog.jsonb_typeof(purchased_upgrades->'piercing') = 'number' then greatest(0, (purchased_upgrades->>'piercing')::integer) else 0 end,
  'chain_lightning', case when pg_catalog.jsonb_typeof(purchased_upgrades->'chain_lightning') = 'number' then greatest(0, (purchased_upgrades->>'chain_lightning')::integer) else 0 end,
  'reroll', case when pg_catalog.jsonb_typeof(purchased_upgrades->'reroll') = 'number' then greatest(0, (purchased_upgrades->>'reroll')::integer) else 0 end,
  'oracle', case when pg_catalog.jsonb_typeof(purchased_upgrades->'oracle') = 'number' then greatest(0, (purchased_upgrades->>'oracle')::integer) else 0 end,
  'banish', case when pg_catalog.jsonb_typeof(purchased_upgrades->'banish') = 'number' then greatest(0, (purchased_upgrades->>'banish')::integer) else 0 end,
  'fortune', case when pg_catalog.jsonb_typeof(purchased_upgrades->'fortune') = 'number' then greatest(0, (purchased_upgrades->>'fortune')::integer) else 0 end,
  'transmutation', case when pg_catalog.jsonb_typeof(purchased_upgrades->'transmutation') = 'number' then greatest(0, (purchased_upgrades->>'transmutation')::integer) else 0 end,
  'anchor_soul', case
    when purchased_upgrades->>'anchor_soul' = 'true' then 1
    when purchased_upgrades->>'anchor_soul' = 'false' then 0
    when pg_catalog.jsonb_typeof(purchased_upgrades->'anchor_soul') = 'number' then greatest(0, (purchased_upgrades->>'anchor_soul')::integer)
    else 0
  end
  );

create or replace function public.purchase_fractal_upgrade(_upgrade text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.fractal_player_state;
  master_access boolean;
  current_level integer;
  next_level integer;
  max_level integer;
  price integer;
  required_corruption integer := 0;
  upgrades jsonb;
  is_level_upgrade boolean;
  mastery_key text;
  weapon_key text;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar na conta';
  end if;

  if _upgrade is null or _upgrade not in (
    'area','experience','rarity','speed_2x','speed_3x',
    'health','projectile_duration','projectile_range','projectiles',
    'ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation',
    'anchor_soul','omen_archive',
    'weapon_nucleus','weapon_scythe','weapon_orbitals','weapon_gravity','weapon_sentinels',
    'evolution_void_revolver','evolution_nucleus','evolution_scythe','evolution_orbitals','evolution_gravity','evolution_sentinels'
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

  required_corruption := case
    when _upgrade in ('reroll','oracle') then 1
    when _upgrade in ('anchor_soul','fortune') then 2
    when _upgrade = 'transmutation' then 3
    when _upgrade = 'omen_archive' then 4
    else 0
  end;

  if required_corruption > s.corruption_unlocked and not master_access then
    raise exception 'Esta melhoria exige Corrupção nível %', required_corruption;
  end if;

  is_level_upgrade := _upgrade in (
    'area','experience','rarity','projectile_range','projectiles',
    'health','projectile_duration','ricochet','piercing','chain_lightning',
    'reroll','oracle','banish','fortune','transmutation','anchor_soul'
  );

  if is_level_upgrade then
    current_level := coalesce((upgrades->>_upgrade)::integer, 0);
    next_level := current_level + 1;
    max_level := case
      when _upgrade = 'health' then 15
      when _upgrade in ('area','experience','projectile_range','projectiles') then 4
      when _upgrade = 'fortune' then 5
      when _upgrade = 'anchor_soul' then 3
      when _upgrade in ('reroll','oracle') then 10
      when _upgrade = 'banish' then 5
      else 3
    end;

    if next_level > max_level then
      raise exception 'Esta melhoria já está no nível máximo';
    end if;

    price := case _upgrade
      when 'area' then (array[300,600,1000,1600])[next_level]
      when 'experience' then (array[250,500,900,1400])[next_level]
      when 'rarity' then (array[400,800,1400])[next_level]
      when 'health' then (array[500,800,1200,1700,2300,3000,3800,4700,5700,6800,8000,9300,10700,12200,13800])[next_level]
      when 'projectile_duration' then (array[600,1000,1600])[next_level]
      when 'projectile_range' then (array[350,600,1000,1600])[next_level]
      when 'projectiles' then (array[700,1200,1800,2800])[next_level]
      when 'ricochet' then (array[500,900,1400])[next_level]
      when 'piercing' then (array[600,1000,1500])[next_level]
      when 'chain_lightning' then (array[700,1200,1800])[next_level]
      when 'reroll' then (array[500,800,1200,1700,2300,3000,3800,4700,5700,6800])[next_level]
      when 'oracle' then (array[1000,2000,4000,8000,16000,32000,64000,128000,256000,512000])[next_level]
      when 'banish' then (array[600,1000,1500,2200,3000])[next_level]
      when 'fortune' then (array[800,1400,2300,3500,5000])[next_level]
      when 'transmutation' then (array[1500,2700,4500])[next_level]
      when 'anchor_soul' then (array[3500,7000,20000])[next_level]
      else null
    end;

    if price is null then raise exception 'Preço da melhoria não configurado'; end if;
    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], to_jsonb(next_level), true),
        updated_at = pg_catalog.now()
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

    price := case _upgrade
      when 'speed_2x' then 1000
      when 'speed_3x' then 2000
      when 'omen_archive' then 6000
      when 'weapon_nucleus' then 8000
      when 'weapon_scythe' then 9000
      when 'weapon_orbitals' then 10000
      when 'weapon_gravity' then 11000
      when 'weapon_sentinels' then 12000
      when 'evolution_void_revolver' then 5000
      when 'evolution_nucleus' then 5000
      when 'evolution_scythe' then 5000
      when 'evolution_orbitals' then 5000
      when 'evolution_gravity' then 5000
      when 'evolution_sentinels' then 5000
      else null
    end;

    if price is null then raise exception 'Preço da melhoria não configurado'; end if;

    if pg_catalog.left(_upgrade, 10) = 'evolution_' then
      mastery_key := case _upgrade
        when 'evolution_void_revolver' then 'mastery_void_revolver'
        when 'evolution_nucleus' then 'mastery_nucleus'
        when 'evolution_scythe' then 'mastery_scythe'
        when 'evolution_orbitals' then 'mastery_orbitals'
        when 'evolution_gravity' then 'mastery_gravity'
        when 'evolution_sentinels' then 'mastery_sentinels'
      end;
      if not coalesce((upgrades->>mastery_key)::boolean,false) and not master_access then
        raise exception 'Conclua uma expedição vitoriosa com esta arma para liberar seu projeto';
      end if;
    end if;

    if s.fractals < price and not master_access then raise exception 'Fractais insuficientes'; end if;

    update public.fractal_player_state
    set fractals = case when master_access then fractals else fractals - price end,
        purchased_upgrades = jsonb_set(upgrades, array[_upgrade], 'true'::jsonb, true),
        updated_at = pg_catalog.now()
    where user_id = auth.uid();
  end if;

  return public.get_fractal_state();
end;
$$;


revoke all on function public.purchase_fractal_upgrade(text) from public, anon;
grant execute on function public.purchase_fractal_upgrade(text) to authenticated;

commit;
