-- Strategic 3D&T Alpha combat: universal tactics + learned spell actions.
-- Additive migration. Apply manually to Supabase only after reviewing/testing.

alter table public.spells
  add column if not exists combat_effect text not null default 'damage',
  add column if not exists combat_power integer not null default 2,
  add column if not exists combat_enabled boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'spells_combat_effect_check'
      and conrelid = 'public.spells'::regclass
  ) then
    alter table public.spells
      add constraint spells_combat_effect_check
      check (combat_effect in ('damage','pierce','heal','guard','weaken'));
  end if;
end $$;

alter table public.combat_sessions
  add column if not exists hero_r integer not null default 1,
  add column if not exists hero_known_spells uuid[] not null default '{}',
  add column if not exists hero_traits jsonb not null default '[]'::jsonb,
  add column if not exists monster_strategy text not null default 'balanced',
  add column if not exists hero_guard_bonus integer not null default 0,
  add column if not exists hero_aim_bonus integer not null default 0,
  add column if not exists monster_weakened integer not null default 0,
  add column if not exists monster_guard_bonus integer not null default 0,
  add column if not exists monster_guard_used boolean not null default false;

create or replace function public._combat_state(_s public.combat_sessions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', _s.id,
    'hero', _s.hero_name,
    'monster', _s.monster_name,
    'heroPv', _s.hero_pv,
    'heroMaxPv', _s.hero_max_pv,
    'heroPm', _s.hero_pm,
    'heroMaxPm', _s.hero_max_pm,
    'monsterPv', _s.monster_pv,
    'monsterMaxPv', _s.monster_max_pv,
    'turn', _s.turn_number,
    'status', _s.status,
    'won', _s.status = 'won',
    'reward', case when _s.reward_paid then
      coalesce((_s.battle_log->-1->>'reward')::int, 0) else 0 end,
    'xp', case when _s.status = 'won' then _s.monster_xp else 0 end,
    'heroTraits', _s.hero_traits,
    'monsterStrategy', _s.monster_strategy,
    'log', _s.battle_log,
    'abilities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sp.id,
        'name', sp.name,
        'school', sp.school,
        'description', sp.description,
        'pmCost', sp.pm_cost,
        'effect', sp.combat_effect,
        'power', sp.combat_power
      ) order by sp.name)
      from public.spells sp
      where sp.id = any(coalesce(_s.hero_known_spells, '{}'::uuid[]))
        and sp.combat_enabled
    ), '[]'::jsonb)
  );
$$;

create or replace function public.start_combat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ch public.characters;
  m public.monsters;
  cid uuid;
  bf int := 0; bh int := 0; br int := 0; ba int := 0; bp int := 0; bpm int := 0;
  maxpv int; maxpm int; sid uuid; s public.combat_sessions;
  strategy text;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;

  select active_character_id into cid
  from public.profiles where id = auth.uid() for update;
  if cid is null then raise exception 'Defina uma ficha ativa para lutar'; end if;

  -- Reuse a live encounter. A profile-row lock serializes simultaneous starts.
  select * into s
  from public.combat_sessions
  where user_id = auth.uid() and status = 'active'
  order by created_at desc
  limit 1
  for update;
  if found then return public._combat_state(s); end if;

  select * into ch
  from public.characters
  where id = cid and owner_id = auth.uid()
  for update;
  if not found then raise exception 'Defina uma ficha ativa para lutar'; end if;

  select * into m from public.monsters where active order by random() limit 1;
  if not found then raise exception 'Nenhum monstro disponível'; end if;

  perform public._spend_vigor(2);

  select
    coalesce(sum(coalesce((bonus->>'f')::int,0)),0),
    coalesce(sum(coalesce((bonus->>'h')::int,0)),0),
    coalesce(sum(coalesce((bonus->>'r')::int,0)),0),
    coalesce(sum(coalesce((bonus->>'a')::int,0)),0),
    coalesce(sum(coalesce((bonus->>'pdf')::int,0)),0),
    coalesce(sum(coalesce((bonus->>'pm')::int,0)),0)
  into bf,bh,br,ba,bp,bpm
  from public.chest_items
  where equipped_character_id = cid and owner_id = auth.uid();

  maxpv := greatest(1, (ch.r + br) * 5);
  maxpm := greatest(0, (ch.r + br) * 5 + bpm);
  strategy := case
    when m.f >= m.a + 2 then 'aggressive'
    when m.a >= m.f + 2 then 'defensive'
    else 'balanced'
  end;

  insert into public.combat_sessions(
    user_id, character_id, hero_name, hero_f, hero_h, hero_a, hero_pdf,
    hero_pv, hero_max_pv, hero_pm, hero_max_pm, hero_r,
    hero_known_spells, hero_traits,
    monster_name, monster_f, monster_h, monster_a, monster_pdf,
    monster_pv, monster_max_pv, monster_reward, monster_xp, monster_strategy
  ) values (
    auth.uid(), ch.id, ch.name, ch.f+bf, ch.h+bh, ch.a+ba, ch.pdf+bp,
    least(maxpv, greatest(0, coalesce(ch.pv_current, maxpv))), maxpv,
    least(maxpm, greatest(0, coalesce(ch.pm_current, maxpm))), maxpm,
    greatest(0, ch.r + br),
    coalesce(ch.known_spells, '{}'::uuid[]),
    coalesce(ch.skills, '[]'::jsonb) || coalesce(ch.advantages, '[]'::jsonb),
    m.name, m.f, m.h, m.a, m.pdf, greatest(1,m.pv), greatest(1,m.pv),
    m.reward, greatest(0,coalesce(m.xp,1)), strategy
  ) returning id into sid;

  select * into s from public.combat_sessions where id = sid;
  update public.characters
  set pv_current = s.hero_pv, pm_current = s.hero_pm
  where id = ch.id and owner_id = auth.uid();

  return public._combat_state(s);
end;
$$;

drop function if exists public.perform_combat_action(uuid, text);

create or replace function public.perform_combat_action(
  _session_id uuid,
  _action text,
  _spell_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.combat_sessions;
  sp public.spells;
  d int; fa int; fd int; dmg int;
  action_label text;
  attack_stat int := 0;
  guard_bonus int := 0;
  reward int := 0;
  settings public.game_settings;
  spell_effect text;
  spell_power int;
  spell_cost int;
  aim_bonus int := 0;
  enemy_action text;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  if _action is null or _action not in ('attack','power','defend','recover','aim','feint','spell') then
    raise exception 'Ação inválida';
  end if;

  select * into s
  from public.combat_sessions
  where id = _session_id and user_id = auth.uid()
  for update;
  if not found then raise exception 'Combate não encontrado'; end if;
  if s.status <> 'active' then raise exception 'Este combate já terminou'; end if;

  if _action = 'spell' then
    if _spell_id is null or not (_spell_id = any(coalesce(s.hero_known_spells, '{}'::uuid[]))) then
      raise exception 'Esta magia não pertence à ficha usada no combate';
    end if;
    select * into sp
    from public.spells
    where id = _spell_id and combat_enabled;
    if not found then raise exception 'Esta magia não está configurada para combate'; end if;
    spell_cost := greatest(0, sp.pm_cost);
    spell_power := greatest(0, sp.combat_power);
    spell_effect := sp.combat_effect;
    if s.hero_pm < spell_cost then raise exception 'PM insuficiente para %', sp.name; end if;
    if spell_effect not in ('damage','pierce','heal','guard','weaken') then
      raise exception 'Efeito de combate inválido para esta magia';
    end if;
    s.hero_pm := s.hero_pm - spell_cost;
    action_label := 'Magia: ' || sp.name;
  elsif _action = 'power' then
    if s.hero_pm < 1 then raise exception 'PM insuficiente para o golpe poderoso'; end if;
    s.hero_pm := s.hero_pm - 1;
    attack_stat := greatest(s.hero_f,s.hero_pdf) + 2;
    action_label := 'Golpe poderoso';
  elsif _action = 'attack' then
    attack_stat := greatest(s.hero_f,s.hero_pdf);
    action_label := 'Ataque básico';
  elsif _action = 'feint' then
    attack_stat := greatest(s.hero_f,s.hero_pdf) + 1;
    action_label := 'Finta';
  elsif _action = 'defend' then
    guard_bonus := 3;
    action_label := 'Postura defensiva';
  elsif _action = 'aim' then
    s.hero_aim_bonus := least(4, s.hero_aim_bonus + 2);
    action_label := 'Mirar / preparar ataque';
  elsif _action = 'recover' then
    if s.hero_pm < 1 then raise exception 'PM insuficiente para recuperar PV'; end if;
    if s.hero_pv >= s.hero_max_pv then raise exception 'PV já está cheio'; end if;
    s.hero_pm := s.hero_pm - 1;
    s.hero_pv := least(s.hero_max_pv, s.hero_pv + 3);
    action_label := 'Recuperar fôlego';
  else
    action_label := 'Magia';
  end if;

  if _action in ('attack','power','feint') then
    aim_bonus := s.hero_aim_bonus;
    s.hero_aim_bonus := 0;
    d := 1 + floor(random()*6)::int;
    fa := attack_stat + s.hero_h + aim_bonus + d;
    fd := s.monster_a + s.monster_h + s.monster_guard_bonus + 1 + floor(random()*6)::int;
    s.monster_guard_bonus := 0;
    dmg := greatest(0, fa - fd);
    if d = 6 then dmg := dmg + attack_stat; end if;
    s.monster_pv := greatest(0, s.monster_pv - dmg);
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
      'turn',s.turn_number,'who',s.hero_name,'action',action_label,
      'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',s.monster_pv,'target','monster'
    ));
    if _action = 'feint' and dmg > 0 then
      s.monster_weakened := greatest(s.monster_weakened, 2);
    end if;
  elsif _action = 'spell' then
    if spell_effect in ('damage','pierce') then
      d := 1 + floor(random()*6)::int;
      fa := greatest(s.hero_f,s.hero_pdf) + s.hero_h + spell_power + s.hero_aim_bonus + d;
      if spell_effect = 'pierce' then
        fd := s.monster_h + s.monster_guard_bonus + 1 + floor(random()*6)::int;
      else
        fd := s.monster_a + s.monster_h + s.monster_guard_bonus + 1 + floor(random()*6)::int;
      end if;
      s.hero_aim_bonus := 0;
      s.monster_guard_bonus := 0;
      dmg := greatest(0, fa - fd);
      if d = 6 then dmg := dmg + greatest(s.hero_f,s.hero_pdf); end if;
      s.monster_pv := greatest(0, s.monster_pv - dmg);
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.hero_name,'action',action_label,
        'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',s.monster_pv,'target','monster'
      ));
    elsif spell_effect = 'heal' then
      s.hero_pv := least(s.hero_max_pv, s.hero_pv + greatest(1,spell_power));
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.hero_name,'action',action_label,
        'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.hero_pv,'target','hero',
        'effect','heal','amount',greatest(1,spell_power)
      ));
    elsif spell_effect = 'guard' then
      guard_bonus := greatest(1,spell_power);
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.hero_name,'action',action_label,
        'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.hero_pv,'target','hero',
        'effect','guard','amount',guard_bonus
      ));
    elsif spell_effect = 'weaken' then
      s.monster_weakened := greatest(s.monster_weakened, greatest(1,spell_power));
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.hero_name,'action',action_label,
        'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.monster_pv,'target','monster',
        'effect','weaken','amount',greatest(1,spell_power)
      ));
    end if;
  else
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
      'turn',s.turn_number,'who',s.hero_name,'action',action_label,
      'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.hero_pv,'target','hero'
    ));
  end if;

  -- Strategic enemy response: aggressive enemies periodically overextend;
  -- defensive enemies brace when near defeat; balanced enemies keep pressure.
  if s.monster_pv > 0 then
    if s.monster_strategy = 'defensive'
       and s.monster_pv * 100 <= s.monster_max_pv * 35
       and not s.monster_guard_used then
      s.monster_guard_bonus := 2;
      s.monster_guard_used := true;
      enemy_action := 'Guarda defensiva (+2 FD no próximo ataque)';
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.monster_name,'action',enemy_action,
        'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.monster_pv,'target','monster'
      ));
    else
      d := 1 + floor(random()*6)::int;
      fa := greatest(s.monster_f,s.monster_pdf) + s.monster_h + d;
      if s.monster_strategy = 'aggressive' and mod(s.turn_number,3) = 0 then
        fa := fa + 2;
        enemy_action := 'Investida brutal';
      else
        enemy_action := 'Ataque inimigo';
      end if;
      fd := s.hero_a + s.hero_h + 1 + floor(random()*6)::int + guard_bonus + s.hero_guard_bonus;
      if s.monster_weakened > 0 then
        fa := greatest(0, fa - s.monster_weakened);
        s.monster_weakened := 0;
      end if;
      s.hero_guard_bonus := 0;
      dmg := greatest(0, fa - fd);
      s.hero_pv := greatest(0, s.hero_pv - dmg);
      s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
        'turn',s.turn_number,'who',s.monster_name,'action',enemy_action,
        'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',s.hero_pv,'target','hero'
      ));
    end if;
  end if;

  if s.monster_pv <= 0 then s.status := 'won';
  elsif s.hero_pv <= 0 then s.status := 'lost'; end if;

  if s.status <> 'active' and not s.reward_paid then
    select * into settings from public.game_settings where id = 1;
    reward := case when s.status = 'won'
      then coalesce(s.monster_reward,
        coalesce(settings.combat_win_base,0)
        + coalesce(settings.combat_win_per_level,0)
          * greatest(1,(s.monster_f+s.monster_h+s.monster_a+s.monster_pdf)/2))
      else coalesce(settings.combat_loss,0)
    end;
    perform public._reward(reward, 'combate',
      case when s.status='won' then 'Venceu '||s.monster_name else 'Derrota para '||s.monster_name end);
    if s.status = 'won' then
      update public.characters
      set xp = xp + s.monster_xp
      where id = s.character_id and owner_id = auth.uid();
    end if;
    s.reward_paid := true;
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
      'system','settlement','reward',reward,
      'xp',case when s.status='won' then s.monster_xp else 0 end
    ));
  end if;

  update public.characters
  set pv_current=s.hero_pv, pm_current=s.hero_pm
  where id=s.character_id and owner_id=auth.uid();

  s.turn_number := s.turn_number + 1;
  update public.combat_sessions
  set hero_pv=s.hero_pv,
      hero_pm=s.hero_pm,
      monster_pv=s.monster_pv,
      turn_number=s.turn_number,
      status=s.status,
      reward_paid=s.reward_paid,
      battle_log=s.battle_log,
      hero_guard_bonus=s.hero_guard_bonus,
      hero_aim_bonus=s.hero_aim_bonus,
      monster_weakened=s.monster_weakened,
      monster_guard_bonus=s.monster_guard_bonus,
      monster_guard_used=s.monster_guard_used,
      updated_at=now()
  where id=s.id
  returning * into s;

  return public._combat_state(s);
end;
$$;

create or replace function public.get_active_combat()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.combat_sessions;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  select * into s from public.combat_sessions
  where user_id=auth.uid() and status='active'
  order by created_at desc limit 1;
  if not found then return null; end if;
  return public._combat_state(s);
end;
$$;

create or replace function public.get_combat_state(_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.combat_sessions;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  select * into s from public.combat_sessions
  where id=_session_id and user_id=auth.uid();
  if not found then raise exception 'Combate não encontrado'; end if;
  return public._combat_state(s);
end;
$$;

revoke all on function public._combat_state(public.combat_sessions) from public, anon, authenticated;
revoke all on function public.start_combat() from public, anon;
revoke all on function public.perform_combat_action(uuid,text,uuid) from public, anon;
revoke all on function public.get_combat_state(uuid) from public, anon;
revoke all on function public.get_active_combat() from public, anon;
grant execute on function public.start_combat() to authenticated;
grant execute on function public.perform_combat_action(uuid,text,uuid) to authenticated;
grant execute on function public.get_combat_state(uuid) to authenticated;
grant execute on function public.get_active_combat() to authenticated;
