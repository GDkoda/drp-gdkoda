create or replace function public._spend_vigor(_n int)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profiles set vigor = 10, vigor_date = current_date where id = auth.uid() and vigor_date < current_date;
  update profiles set vigor = vigor - _n where id = auth.uid() and vigor >= _n;
  if not found then raise exception 'Vigor insuficiente. Volte amanhã!'; end if;
end $$;
revoke execute on function public._spend_vigor(int) from public, anon, authenticated;

create or replace function public._reward(_coins int, _kind text, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _coins > 0 then
    update profiles set coins = coins + _coins where id = auth.uid();
    insert into transactions(to_user, kind, coins, note) values (auth.uid(), _kind, _coins, _note);
  end if;
end $$;
revoke execute on function public._reward(int,text,text) from public, anon, authenticated;

-- Tavern dice: 1 vigor, bet coins, 2d6 vs house
create or replace function public.play_dice(_bet int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare bal int; p1 int; p2 int; h1 int; h2 int; result text; delta int;
begin
  if _bet < 1 or _bet > 50 then raise exception 'Aposta entre 1 e 50 moedas'; end if;
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

-- Quick combat: 2 vigor, uses active character, resolved server-side
create or replace function public.play_combat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare ch characters; cid uuid; bf int:=0; bh int:=0; br int:=0; ba int:=0; bp int:=0;
  F int; H int; A int; P int; pv int; mpv int; mF int; mH int; mA int; mname text;
  lg jsonb := '[]'; turn int := 0; d int; fa int; fd int; dmg int; won boolean; reward int; lvl int;
begin
  select active_character_id into cid from profiles where id = auth.uid();
  select * into ch from characters where id = cid and owner_id = auth.uid();
  if not found then raise exception 'Defina uma ficha ativa para lutar'; end if;
  perform _spend_vigor(2);
  select coalesce(sum((bonus->>'f')::int),0), coalesce(sum((bonus->>'h')::int),0), coalesce(sum((bonus->>'r')::int),0),
         coalesce(sum((bonus->>'a')::int),0), coalesce(sum((bonus->>'pdf')::int),0)
    into bf,bh,br,ba,bp from chest_items where equipped_character_id = cid;
  F := ch.f+bf; H := ch.h+bh; A := ch.a+ba; P := ch.pdf+bp;
  pv := greatest(1,(ch.r+br)*5);
  lvl := greatest(1, (ch.f+ch.h+ch.r+ch.a+ch.pdf)/3);
  mname := (array['Goblin','Lobo Atroz','Esqueleto','Orc Saqueador','Troll das Cavernas'])[1+floor(random()*5)];
  mF := lvl; mH := greatest(0,lvl-1); mA := greatest(0,lvl-1); mpv := 5*lvl;
  while pv > 0 and mpv > 0 and turn < 20 loop
    turn := turn + 1;
    d := 1+floor(random()*6); fa := greatest(F,P)+H+d; fd := mA+mH+1+floor(random()*6);
    dmg := greatest(0, fa-fd); if d = 6 then dmg := dmg + greatest(F,P); end if;
    mpv := greatest(0, mpv-dmg);
    lg := lg || jsonb_build_object('turn',turn,'who','herói','fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',mpv);
    exit when mpv = 0;
    d := 1+floor(random()*6); fa := mF+mH+d; fd := A+H+1+floor(random()*6);
    dmg := greatest(0, fa-fd);
    pv := greatest(0, pv-dmg);
    lg := lg || jsonb_build_object('turn',turn,'who',mname,'fa',fa,'fd',fd,'dmg',dmg,'crit',d=6,'hp',pv);
  end loop;
  won := mpv = 0;
  reward := case when won then 10 + 5*lvl else 2 end;
  perform _reward(reward, 'combate', case when won then 'Venceu '||mname else 'Derrota para '||mname end);
  if won then update characters set xp = xp + 1 where id = cid; end if;
  return jsonb_build_object('monster',mname,'won',won,'reward',reward,'xp',case when won then 1 else 0 end,'log',lg,'hero',ch.name);
end $$;

-- Puzzles: session table hidden from clients
create table public.puzzle_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  answer text not null,
  solved boolean,
  created_at timestamptz not null default now()
);
grant all on public.puzzle_sessions to service_role;
alter table public.puzzle_sessions enable row level security;

create or replace function public.start_puzzle()
returns jsonb language plpgsql security definer set search_path = public as $$
declare kind int; a int; b int; c int; q text; ans text; opts jsonb; sid uuid;
begin
  perform _spend_vigor(1);
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
  insert into puzzle_sessions(user_id, answer) values (auth.uid(), ans) returning id into sid;
  return jsonb_build_object('id', sid, 'question', q);
end $$;

create or replace function public.solve_puzzle(_id uuid, _answer text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s puzzle_sessions; ok boolean;
begin
  select * into s from puzzle_sessions where id = _id and user_id = auth.uid() for update;
  if not found or s.solved is not null then raise exception 'Enigma inválido ou já respondido'; end if;
  if s.created_at < now() - interval '10 minutes' then raise exception 'O tempo do enigma acabou'; end if;
  ok := trim(_answer) = s.answer;
  update puzzle_sessions set solved = ok where id = _id;
  if ok then perform _reward(15, 'enigma', 'Enigma resolvido'); end if;
  return jsonb_build_object('correct', ok, 'answer', s.answer, 'reward', case when ok then 15 else 0 end);
end $$;

create or replace function public.get_vigor()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  update profiles set vigor = 10, vigor_date = current_date where id = auth.uid() and vigor_date < current_date;
  select vigor into v from profiles where id = auth.uid();
  return v;
end $$;

revoke execute on function public.play_dice(int), public.play_combat(), public.start_puzzle(), public.solve_puzzle(uuid,text), public.get_vigor() from public, anon;
grant execute on function public.play_dice(int), public.play_combat(), public.start_puzzle(), public.solve_puzzle(uuid,text), public.get_vigor() to authenticated;