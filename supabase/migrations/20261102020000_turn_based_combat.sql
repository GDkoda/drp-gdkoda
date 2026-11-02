create table if not exists public.combat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  hero_name text not null,
  hero_f integer not null,
  hero_h integer not null,
  hero_a integer not null,
  hero_pdf integer not null,
  hero_pv integer not null,
  hero_max_pv integer not null,
  hero_pm integer not null,
  hero_max_pm integer not null,
  monster_name text not null,
  monster_f integer not null,
  monster_h integer not null,
  monster_a integer not null,
  monster_pdf integer not null,
  monster_pv integer not null,
  monster_max_pv integer not null,
  monster_reward integer,
  monster_xp integer not null default 1,
  turn_number integer not null default 1,
  status text not null default 'active' check (status in ('active','won','lost')),
  reward_paid boolean not null default false,
  battle_log jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.combat_sessions enable row level security;
create index if not exists combat_sessions_user_active_idx
  on public.combat_sessions (user_id, status, created_at desc);

create or replace function public._combat_state(_s public.combat_sessions)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', _s.id, 'hero', _s.hero_name, 'monster', _s.monster_name,
    'heroPv', _s.hero_pv, 'heroMaxPv', _s.hero_max_pv,
    'heroPm', _s.hero_pm, 'heroMaxPm', _s.hero_max_pm,
    'monsterPv', _s.monster_pv, 'monsterMaxPv', _s.monster_max_pv,
    'turn', _s.turn_number, 'status', _s.status,
    'won', _s.status = 'won', 'reward', case when _s.reward_paid then
      coalesce((_s.battle_log->-1->>'reward')::int, 0) else 0 end,
    'xp', case when _s.status = 'won' then _s.monster_xp else 0 end,
    'log', _s.battle_log
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
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  select active_character_id into cid from public.profiles where id = auth.uid() for update;
  select * into ch from public.characters where id = cid and owner_id = auth.uid() for update;
  if not found then raise exception 'Defina uma ficha ativa para lutar'; end if;
  select * into m from public.monsters where active order by random() limit 1;
  if not found then raise exception 'Nenhum monstro disponível'; end if;

  perform public._spend_vigor(2);
  select coalesce(sum(coalesce((bonus->>'f')::int,0)),0),
         coalesce(sum(coalesce((bonus->>'h')::int,0)),0),
         coalesce(sum(coalesce((bonus->>'r')::int,0)),0),
         coalesce(sum(coalesce((bonus->>'a')::int,0)),0),
         coalesce(sum(coalesce((bonus->>'pdf')::int,0)),0),
         coalesce(sum(coalesce((bonus->>'pm')::int,0)),0)
    into bf,bh,br,ba,bp,bpm
    from public.chest_items where equipped_character_id = cid and owner_id = auth.uid();

  maxpv := greatest(1, (ch.r + br) * 5);
  maxpm := greatest(0, (ch.r + br) * 5 + bpm);
  insert into public.combat_sessions(
    user_id, character_id, hero_name, hero_f, hero_h, hero_a, hero_pdf,
    hero_pv, hero_max_pv, hero_pm, hero_max_pm,
    monster_name, monster_f, monster_h, monster_a, monster_pdf,
    monster_pv, monster_max_pv, monster_reward, monster_xp
  ) values (
    auth.uid(), ch.id, ch.name, ch.f+bf, ch.h+bh, ch.a+ba, ch.pdf+bp,
    least(maxpv, greatest(0, coalesce(ch.pv_current, maxpv))), maxpv,
    least(maxpm, greatest(0, coalesce(ch.pm_current, maxpm))), maxpm,
    m.name, m.f, m.h, m.a, m.pdf, greatest(1,m.pv), greatest(1,m.pv),
    m.reward, greatest(0,coalesce(m.xp,1))
  ) returning id into sid;
  select * into s from public.combat_sessions where id = sid;
  update public.characters set pv_current=s.hero_pv, pm_current=s.hero_pm where id=ch.id;
  return public._combat_state(s);
end;
$$;

create or replace function public.perform_combat_action(_session_id uuid, _action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.combat_sessions;
  d int; fa int; fd int; dmg int; action_label text; guard_bonus int := 0;
  log_entry jsonb; won boolean; reward int; settings public.game_settings;
  attack_stat int;
begin
  if auth.uid() is null then raise exception 'É necessário entrar na conta'; end if;
  select * into s from public.combat_sessions
    where id = _session_id and user_id = auth.uid() for update;
  if not found then raise exception 'Combate não encontrado'; end if;
  if s.status <> 'active' then raise exception 'Este combate já terminou'; end if;
  if _action not in ('attack','power','defend','recover') then raise exception 'Ação inválida'; end if;

  if _action = 'power' then
    if s.hero_pm < 1 then raise exception 'PM insuficiente para o golpe poderoso'; end if;
    s.hero_pm := s.hero_pm - 1;
    attack_stat := greatest(s.hero_f,s.hero_pdf) + 2;
    action_label := 'Golpe poderoso';
  elsif _action = 'attack' then
    attack_stat := greatest(s.hero_f,s.hero_pdf);
    action_label := 'Ataque básico';
  elsif _action = 'defend' then
    attack_stat := 0;
    guard_bonus := 3;
    action_label := 'Postura defensiva';
  else
    if s.hero_pm < 1 then raise exception 'PM insuficiente para recuperar PV'; end if;
    s.hero_pm := s.hero_pm - 1;
    s.hero_pv := least(s.hero_max_pv, s.hero_pv + 3);
    attack_stat := 0;
    action_label := 'Recuperar fôlego';
  end if;

  if _action in ('attack','power') then
    d := 1 + floor(random()*6)::int;
    fa := attack_stat + s.hero_h + d;
    fd := s.monster_a + s.monster_h + 1 + floor(random()*6)::int;
    dmg := greatest(0, fa - fd);
    if d = 6 then dmg := dmg + attack_stat; end if;
    s.monster_pv := greatest(0, s.monster_pv - dmg);
    log_entry := jsonb_build_object('turn',s.turn_number,'who',s.hero_name,'action',action_label,'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',s.monster_pv,'target','monster');
    s.battle_log := s.battle_log || jsonb_build_array(log_entry);
  else
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
      'turn',s.turn_number,'who',s.hero_name,'action',action_label,'fa',0,'fd',0,'dmg',0,'crit',false,'hp',s.hero_pv,'target','hero'
    ));
  end if;

  if s.monster_pv > 0 then
    d := 1 + floor(random()*6)::int;
    fa := greatest(s.monster_f,s.monster_pdf) + s.monster_h + d;
    fd := s.hero_a + s.hero_h + 1 + floor(random()*6)::int + guard_bonus;
    dmg := greatest(0, fa - fd);
    s.hero_pv := greatest(0, s.hero_pv - dmg);
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object(
      'turn',s.turn_number,'who',s.monster_name,'action',case when _action='defend' then 'Ataca contra defesa' else 'Ataque inimigo' end,
      'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',s.hero_pv,'target','hero'
    ));
  end if;

  if s.monster_pv <= 0 then s.status := 'won';
  elsif s.hero_pv <= 0 then s.status := 'lost'; end if;
  if s.status <> 'active' and not s.reward_paid then
    select * into settings from public.game_settings where id=1;
    reward := case when s.status='won'
      then coalesce(s.monster_reward, settings.combat_win_base + settings.combat_win_per_level * greatest(1,(s.monster_f+s.monster_h+s.monster_a+s.monster_pdf)/2))
      else settings.combat_loss end;
    perform public._reward(reward, 'combate', case when s.status='won' then 'Venceu '||s.monster_name else 'Derrota para '||s.monster_name end);
    if s.status='won' then
      update public.characters set xp=xp+s.monster_xp where id=s.character_id and owner_id=auth.uid();
    end if;
    s.reward_paid := true;
    s.battle_log := s.battle_log || jsonb_build_array(jsonb_build_object('system','settlement','reward',reward,'xp',case when s.status='won' then s.monster_xp else 0 end));
  end if;
  if s.status <> 'active' then
    update public.characters set pv_current=s.hero_pv, pm_current=s.hero_pm where id=s.character_id and owner_id=auth.uid();
  else
    update public.characters set pv_current=s.hero_pv, pm_current=s.hero_pm where id=s.character_id and owner_id=auth.uid();
  end if;
  s.turn_number := s.turn_number + 1;
  update public.combat_sessions set hero_pv=s.hero_pv, hero_pm=s.hero_pm, monster_pv=s.monster_pv,
    turn_number=s.turn_number, status=s.status, reward_paid=s.reward_paid,
    battle_log=s.battle_log, updated_at=now()
    where id=s.id returning * into s;
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
  select * into s from public.combat_sessions where id=_session_id and user_id=auth.uid();
  if not found then raise exception 'Combate não encontrado'; end if;
  return public._combat_state(s);
end;
$$;

revoke all on function public._combat_state(public.combat_sessions) from public, anon, authenticated;
revoke all on function public.start_combat() from public, anon;
revoke all on function public.perform_combat_action(uuid,text) from public, anon;
revoke all on function public.get_combat_state(uuid) from public, anon;
grant execute on function public.start_combat() to authenticated;
grant execute on function public.perform_combat_action(uuid,text) to authenticated;
grant execute on function public.get_combat_state(uuid) to authenticated;
