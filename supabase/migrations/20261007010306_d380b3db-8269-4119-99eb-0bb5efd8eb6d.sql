ALTER TABLE public.monsters ADD COLUMN xp integer not null default 1;

CREATE OR REPLACE FUNCTION public.play_combat()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ch characters; cid uuid; bf int:=0; bh int:=0; br int:=0; ba int:=0; bp int:=0;
  F int; H int; A int; P int; pv int; mpv int; mF int; mH int; mA int; mP int; mname text; mreward int; mxp int;
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
  mname := m.name; mF := m.f; mH := m.h; mA := m.a; mP := m.pdf; mpv := greatest(1,m.pv); mxp := greatest(0, m.xp);
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
  if won then update characters set xp = xp + mxp where id = cid; end if;
  return jsonb_build_object('monster',mname,'won',won,'reward',reward,'xp',case when won then mxp else 0 end,'log',lg,'hero',ch.name);
end $function$