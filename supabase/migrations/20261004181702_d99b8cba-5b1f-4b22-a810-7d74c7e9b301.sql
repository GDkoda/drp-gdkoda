create table public.game_settings (
  id int primary key default 1 check (id = 1),
  vigor_daily int not null default 5,
  combat_win_base int not null default 10,
  combat_win_per_level int not null default 5,
  combat_loss int not null default 2,
  puzzle_reward int not null default 15,
  checkin_per_day int not null default 10,
  dice_max_bet int not null default 50,
  updated_at timestamptz not null default now()
);
grant select, update on public.game_settings to authenticated;
grant all on public.game_settings to service_role;
alter table public.game_settings enable row level security;
create policy "settings read" on public.game_settings for select to authenticated using (true);
create policy "settings master update" on public.game_settings for update to authenticated using (has_role(auth.uid(),'master')) with check (has_role(auth.uid(),'master'));
insert into public.game_settings(id) values (1);

create table public.monsters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  f int not null default 1, h int not null default 1, a int not null default 1, pdf int not null default 0,
  pv int not null default 5,
  reward int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.monsters to authenticated;
grant all on public.monsters to service_role;
alter table public.monsters enable row level security;
create policy "monsters read" on public.monsters for select to authenticated using (true);
create policy "monsters master" on public.monsters for all to authenticated using (has_role(auth.uid(),'master')) with check (has_role(auth.uid(),'master'));
insert into public.monsters(name,f,h,a,pdf,pv) values
 ('Goblin',1,1,0,0,5),('Lobo Atroz',2,1,1,0,10),('Esqueleto',2,1,2,0,10),('Orc Saqueador',3,2,2,0,15),('Troll das Cavernas',4,2,3,0,25);

create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  reward int,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.puzzles to authenticated;
grant all on public.puzzles to service_role;
alter table public.puzzles enable row level security;
create policy "puzzles master" on public.puzzles for all to authenticated using (has_role(auth.uid(),'master')) with check (has_role(auth.uid(),'master'));

alter table public.puzzle_sessions add column reward int;
alter table public.profiles alter column vigor set default 5;
update public.profiles set vigor = least(vigor, 5);

create or replace function public._spend_vigor(_n integer) returns void language plpgsql security definer set search_path to 'public' as $$
declare mx int;
begin
  select vigor_daily into mx from game_settings where id=1;
  update profiles set vigor = mx, vigor_date = current_date where id = auth.uid() and vigor_date < current_date;
  update profiles set vigor = vigor - _n where id = auth.uid() and vigor >= _n;
  if not found then raise exception 'Vigor insuficiente. Volte amanhã!'; end if;
end $$;

create or replace function public.get_vigor() returns integer language plpgsql security definer set search_path to 'public' as $$
declare v int; mx int;
begin
  select vigor_daily into mx from game_settings where id=1;
  update profiles set vigor = mx, vigor_date = current_date where id = auth.uid() and vigor_date < current_date;
  select vigor into v from profiles where id = auth.uid();
  return v;
end $$;

create or replace function public.daily_checkin() returns integer language plpgsql security definer set search_path to 'public' as $$
declare p profiles; reward int; streak int; per int;
begin
  select checkin_per_day into per from game_settings where id=1;
  select * into p from profiles where id=auth.uid() for update;
  if p.last_checkin is not null and p.last_checkin > now() - interval '24 hours' then
    raise exception 'Check-in já realizado. Volte mais tarde.';
  end if;
  if p.last_checkin is not null and p.last_checkin > now() - interval '48 hours' then
    streak := least(p.checkin_streak + 1, 7);
  else streak := 1; end if;
  reward := per * streak;
  update profiles set coins=coins+reward, checkin_streak=streak, last_checkin=now() where id=auth.uid();
  insert into transactions(to_user,kind,coins,note) values (auth.uid(),'check-in',reward,'Dia '||streak);
  return reward;
end $$;

create or replace function public.play_dice(_bet integer) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare bal int; p1 int; p2 int; h1 int; h2 int; result text; delta int; mx int;
begin
  select dice_max_bet into mx from game_settings where id=1;
  if _bet < 1 or _bet > mx then raise exception 'Aposta entre 1 e % moedas', mx; end if;
  select coins into bal from profiles where id = auth.uid() for update;
  if bal < _bet then raise exception 'Moedas insuficientes'; end if;
  perform _spend_vigor(1);
  p1 := 1 + floor(random()*6); p2 := 1 + floor(random()*6);
  h1 := 1 + floor(random()*6); h2 := 1 + floor(random()*6);
  if p1+p2 > h1+h2 then result := 'vitória'; delta := _bet;
  elsif p1+p2 < h1+h2 then result := 'derrota'; delta := -_bet;
  else result := 'empate'; delta := 0; end if;
  if delta <> 0 then
    update profiles set coins = coins + delta where id = auth.uid();
    insert into transactions(to_user, kind, coins, note) values (auth.uid(), 'dados da taverna', delta, result);
  end if;
  return jsonb_build_object('player', jsonb_build_array(p1,p2), 'house', jsonb_build_array(h1,h2), 'result', result, 'delta', delta);
end $$;

create or replace function public.play_combat() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare ch characters; cid uuid; bf int:=0; bh int:=0; br int:=0; ba int:=0; bp int:=0;
  F int; H int; A int; P int; pv int; mpv int; mF int; mH int; mA int; mP int; mname text; mreward int;
  lg jsonb := '[]'; turn int := 0; d int; fa int; fd int; dmg int; won boolean; reward int; lvl int; s game_settings; m monsters;
begin
  select * into s from game_settings where id=1;
  select active_character_id into cid from profiles where id = auth.uid();
  select * into ch from characters where id = cid and owner_id = auth.uid();
  if not found then raise exception 'Defina uma ficha ativa para lutar'; end if;
  select * into m from monsters where active order by random() limit 1;
  if not found then raise exception 'Nenhum monstro disponível'; end if;
  perform _spend_vigor(2);
  select coalesce(sum((bonus->>'f')::int),0), coalesce(sum((bonus->>'h')::int),0), coalesce(sum((bonus->>'r')::int),0),
         coalesce(sum((bonus->>'a')::int),0), coalesce(sum((bonus->>'pdf')::int),0)
    into bf,bh,br,ba,bp from chest_items where equipped_character_id = cid;
  F := ch.f+bf; H := ch.h+bh; A := ch.a+ba; P := ch.pdf+bp;
  pv := greatest(1,(ch.r+br)*5);
  lvl := greatest(1, (m.f+m.h+m.a+m.pdf)/2);
  mname := m.name; mF := m.f; mH := m.h; mA := m.a; mP := m.pdf; mpv := greatest(1,m.pv);
  while pv > 0 and mpv > 0 and turn < 20 loop
    turn := turn + 1;
    d := 1+floor(random()*6); fa := greatest(F,P)+H+d; fd := mA+mH+1+floor(random()*6);
    dmg := greatest(0, fa-fd); if d = 6 then dmg := dmg + greatest(F,P); end if;
    mpv := greatest(0, mpv-dmg);
    lg := lg || jsonb_build_object('turn',turn,'who','herói','fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',mpv);
    exit when mpv = 0;
    d := 1+floor(random()*6); fa := greatest(mF,mP)+mH+d; fd := A+H+1+floor(random()*6);
    dmg := greatest(0, fa-fd);
    pv := greatest(0, pv-dmg);
    lg := lg || jsonb_build_object('turn',turn,'who',mname,'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',pv);
  end loop;
  won := mpv = 0;
  reward := case when won then coalesce(m.reward, s.combat_win_base + s.combat_win_per_level*lvl) else s.combat_loss end;
  perform _reward(reward, 'combate', case when won then 'Venceu '||mname else 'Derrota para '||mname end);
  if won then update characters set xp = xp + 1 where id = cid; end if;
  return jsonb_build_object('monster',mname,'won',won,'reward',reward,'xp',case when won then 1 else 0 end,'log',lg,'hero',ch.name);
end $$;

create or replace function public.start_puzzle() returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare kind int; a int; b int; c int; q text; ans text; sid uuid; pz puzzles; rw int;
begin
  perform _spend_vigor(1);
  select puzzle_reward into rw from game_settings where id=1;
  if exists (select 1 from puzzles where active) and random() < 0.6 then
    select * into pz from puzzles where active order by random() limit 1;
    q := pz.question; ans := pz.answer; rw := coalesce(pz.reward, rw);
  else
    kind := floor(random()*3);
    if kind = 0 then
      a := 1+floor(random()*9); b := 2+floor(random()*4);
      q := format('Qual o próximo número da sequência rúnica? %s, %s, %s, %s, ?', a, a*b, a*b*b, a*b*b*b);
      ans := (a*b*b*b*b)::text;
    elsif kind = 1 then
      a := 2+floor(random()*8); b := 3+floor(random()*8); c := 1+floor(random()*9);
      q := format('Um mercador tem %s sacos com %s moedas cada e gasta %s. Quantas moedas restam?', a, b, c);
      ans := (a*b-c)::text;
    else
      a := 1+floor(random()*20); b := 1+floor(random()*20);
      q := format('O guardião diz: "Pensei num número. Somando %s a ele obtenho %s vezes 2." Que número é?', a, a+b);
      ans := ((a+b)*2 - a)::text;
    end if;
  end if;
  insert into puzzle_sessions(user_id, answer, reward) values (auth.uid(), ans, rw) returning id into sid;
  return jsonb_build_object('id', sid, 'question', q);
end $$;

create or replace function public.solve_puzzle(_id uuid, _answer text) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s puzzle_sessions; ok boolean; rw int;
begin
  select * into s from puzzle_sessions where id = _id and user_id = auth.uid() for update;
  if not found or s.solved is not null then raise exception 'Enigma inválido ou já respondido'; end if;
  if s.created_at < now() - interval '10 minutes' then raise exception 'O tempo do enigma acabou'; end if;
  ok := lower(trim(_answer)) = lower(trim(s.answer));
  rw := coalesce(s.reward, 15);
  update puzzle_sessions set solved = ok where id = _id;
  if ok then perform _reward(rw, 'enigma', 'Enigma resolvido'); end if;
  return jsonb_build_object('correct', ok, 'answer', s.answer, 'reward', case when ok then rw else 0 end);
end $$;

create or replace function public.master_adjust_vigor(_user uuid, _delta integer) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not has_role(auth.uid(),'master') then raise exception 'Apenas o Mestre'; end if;
  update profiles set vigor = greatest(0, vigor + _delta), vigor_date = greatest(vigor_date, current_date) where id=_user;
  insert into transactions(from_user,to_user,kind,coins,note) values (auth.uid(),_user,'ajuste de vigor',0,(case when _delta>0 then '+' else '' end)||_delta||' vigor');
end $$;

create or replace function public.master_purge_user(_user uuid) returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not has_role(auth.uid(),'master') then raise exception 'Apenas o Mestre'; end if;
  if _user = auth.uid() then raise exception 'Não pode excluir a própria conta'; end if;
  delete from chest_items where owner_id=_user;
  delete from characters where owner_id=_user;
  delete from puzzle_sessions where user_id=_user;
  delete from user_roles where user_id=_user;
  delete from profiles where id=_user;
end $$;

revoke execute on function public.master_adjust_vigor(uuid,int) from public, anon;
revoke execute on function public.master_purge_user(uuid) from public, anon;
grant execute on function public.master_adjust_vigor(uuid,int) to authenticated;
grant execute on function public.master_purge_user(uuid) to authenticated;