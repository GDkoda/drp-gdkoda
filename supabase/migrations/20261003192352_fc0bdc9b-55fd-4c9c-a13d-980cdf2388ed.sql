create type public.app_role as enum ('master','player');

create table public.profiles (
  id uuid primary key,
  username text not null unique,
  display_name text not null,
  coins int not null default 100,
  vigor int not null default 10,
  vigor_date date not null default current_date,
  last_checkin timestamptz,
  checkin_streak int not null default 0,
  active_character_id uuid,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (display_name, active_character_id) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "roles read own or master" on public.user_roles for select to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(),'master'));
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated
using (id = auth.uid()) with check (id = auth.uid());

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null default 'Novo Herói',
  concept text not null default '',
  f int not null default 0, h int not null default 0, r int not null default 1,
  a int not null default 0, pdf int not null default 0,
  pv_current int not null default 5, pm_current int not null default 5,
  pp_total int not null default 12,
  xp int not null default 0,
  advantages jsonb not null default '[]',
  disadvantages jsonb not null default '[]',
  skills jsonb not null default '[]',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.characters to authenticated;
grant all on public.characters to service_role;
alter table public.characters enable row level security;
create policy "chars select" on public.characters for select to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(),'master'));
create policy "chars insert" on public.characters for insert to authenticated
with check (owner_id = auth.uid());
create policy "chars update" on public.characters for update to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(),'master'));
create policy "chars delete" on public.characters for delete to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(),'master'));

create table public.shop_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null default 'arma',
  price int not null default 10,
  bonus jsonb not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.shop_items to authenticated;
grant all on public.shop_items to service_role;
alter table public.shop_items enable row level security;
create policy "shop read" on public.shop_items for select to authenticated using (true);
create policy "shop master write" on public.shop_items for all to authenticated
using (public.has_role(auth.uid(),'master')) with check (public.has_role(auth.uid(),'master'));

create table public.chest_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null,
  description text not null default '',
  category text not null,
  bonus jsonb not null default '{}',
  equipped_character_id uuid references public.characters(id) on delete set null,
  created_at timestamptz not null default now()
);
grant select, delete on public.chest_items to authenticated;
grant all on public.chest_items to service_role;
alter table public.chest_items enable row level security;
create policy "chest select" on public.chest_items for select to authenticated
using (owner_id = auth.uid() or public.has_role(auth.uid(),'master'));
create policy "chest master delete" on public.chest_items for delete to authenticated
using (public.has_role(auth.uid(),'master'));

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  from_user uuid,
  to_user uuid,
  kind text not null,
  coins int not null default 0,
  item_name text,
  note text,
  created_at timestamptz not null default now()
);
grant select on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "tx select" on public.transactions for select to authenticated
using (from_user = auth.uid() or to_user = auth.uid() or public.has_role(auth.uid(),'master'));

-- new user trigger
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare uname text;
begin
  uname := coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1));
  insert into public.profiles (id, username, display_name) values (new.id, uname, uname);
  if lower(uname) = 'gdkoda' and not exists (select 1 from public.user_roles where role='master') then
    insert into public.user_roles (user_id, role) values (new.id, 'master');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'player');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- RPCs
create or replace function public.buy_item(_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it shop_items; bal int;
begin
  select * into it from shop_items where id=_item and active;
  if not found then raise exception 'Item indisponível'; end if;
  select coins into bal from profiles where id=auth.uid() for update;
  if bal < it.price then raise exception 'Moedas insuficientes'; end if;
  update profiles set coins = coins - it.price where id=auth.uid();
  insert into chest_items(owner_id,name,description,category,bonus) values (auth.uid(),it.name,it.description,it.category,it.bonus);
  insert into transactions(from_user,kind,coins,item_name) values (auth.uid(),'compra',it.price,it.name);
end $$;

create or replace function public.transfer_coins(_to uuid, _amount int)
returns void language plpgsql security definer set search_path = public as $$
declare bal int;
begin
  if _amount <= 0 then raise exception 'Valor inválido'; end if;
  if _to = auth.uid() then raise exception 'Não pode enviar para si mesmo'; end if;
  if not exists (select 1 from profiles where id=_to) then raise exception 'Jogador não encontrado'; end if;
  select coins into bal from profiles where id=auth.uid() for update;
  if bal < _amount then raise exception 'Moedas insuficientes'; end if;
  update profiles set coins = coins - _amount where id=auth.uid();
  update profiles set coins = coins + _amount where id=_to;
  insert into transactions(from_user,to_user,kind,coins) values (auth.uid(),_to,'transferência',_amount);
end $$;

create or replace function public.transfer_item(_chest uuid, _to uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c chest_items;
begin
  select * into c from chest_items where id=_chest and owner_id=auth.uid() for update;
  if not found then raise exception 'Item não encontrado'; end if;
  if _to = auth.uid() or not exists (select 1 from profiles where id=_to) then raise exception 'Destino inválido'; end if;
  update chest_items set owner_id=_to, equipped_character_id=null where id=_chest;
  insert into transactions(from_user,to_user,kind,item_name) values (auth.uid(),_to,'transferência de item',c.name);
end $$;

create or replace function public.equip_item(_chest uuid, _char uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from chest_items where id=_chest and owner_id=auth.uid()) then raise exception 'Item não encontrado'; end if;
  if _char is not null and not exists (select 1 from characters where id=_char and owner_id=auth.uid()) then raise exception 'Ficha inválida'; end if;
  update chest_items set equipped_character_id=_char where id=_chest;
end $$;

create or replace function public.daily_checkin()
returns int language plpgsql security definer set search_path = public as $$
declare p profiles; reward int; streak int;
begin
  select * into p from profiles where id=auth.uid() for update;
  if p.last_checkin is not null and p.last_checkin > now() - interval '24 hours' then
    raise exception 'Check-in já realizado. Volte mais tarde.';
  end if;
  if p.last_checkin is not null and p.last_checkin > now() - interval '48 hours' then
    streak := least(p.checkin_streak + 1, 7);
  else streak := 1; end if;
  reward := 10 * streak;
  update profiles set coins=coins+reward, checkin_streak=streak, last_checkin=now() where id=auth.uid();
  insert into transactions(to_user,kind,coins,note) values (auth.uid(),'check-in',reward,'Dia '||streak);
  return reward;
end $$;

create or replace function public.master_adjust_coins(_user uuid, _delta int, _note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not has_role(auth.uid(),'master') then raise exception 'Apenas o Mestre'; end if;
  update profiles set coins = greatest(0, coins + _delta) where id=_user;
  insert into transactions(from_user,to_user,kind,coins,note) values (auth.uid(),_user,'ajuste do mestre',_delta,_note);
end $$;

create or replace function public.master_give_item(_user uuid, _item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it shop_items;
begin
  if not has_role(auth.uid(),'master') then raise exception 'Apenas o Mestre'; end if;
  select * into it from shop_items where id=_item;
  insert into chest_items(owner_id,name,description,category,bonus) values (_user,it.name,it.description,it.category,it.bonus);
  insert into transactions(from_user,to_user,kind,item_name) values (auth.uid(),_user,'presente do mestre',it.name);
end $$;

insert into public.shop_items (name, description, category, price, bonus) values
('Espada Longa','Lâmina de aço forjada por anões.','arma',40,'{"f":1}'),
('Arco Élfico','Leve e preciso.','arma',45,'{"pdf":1}'),
('Cota de Malha','Proteção confiável.','armadura',50,'{"a":1}'),
('Escudo de Carvalho','Defesa extra em combate.','armadura',30,'{"a":1}'),
('Poção de Vida','Recupera 5 PV.','consumivel',15,'{"pv":5}'),
('Poção de Mana','Recupera 5 PM.','consumivel',15,'{"pm":5}');