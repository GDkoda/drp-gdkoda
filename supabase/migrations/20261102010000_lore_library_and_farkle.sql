-- Lore: biblioteca da campanha com conteúdo privado protegido por RLS.
create table public.lore_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.lore_entries (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.lore_categories(id) on delete set null,
  title text not null,
  summary text not null default '',
  content text not null default '',
  cover_image_url text,
  tags text[] not null default '{}',
  related_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','hidden')),
  visibility text not null default 'master' check (visibility in ('public','master','restricted')),
  allowed_users uuid[] not null default '{}',
  published_at timestamptz,
  created_by uuid not null references auth.users(id) on delete cascade,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lore_attachments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lore_entries(id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  file_size bigint not null default 0,
  created_at timestamptz not null default now()
);

create table public.lore_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.lore_entries(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 3000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lore_entries_category_status_idx on public.lore_entries(category_id, status, published_at desc);
create index lore_entries_tags_idx on public.lore_entries using gin(tags);
create index lore_entries_related_ids_idx on public.lore_entries using gin(related_ids);
create index lore_comments_entry_created_idx on public.lore_comments(entry_id, pinned desc, created_at desc);
create index lore_attachments_entry_idx on public.lore_attachments(entry_id);

grant select, insert, update, delete on public.lore_categories to authenticated;
grant select, insert, update, delete on public.lore_entries to authenticated;
grant select, insert, update, delete on public.lore_attachments to authenticated;
grant select, insert, delete on public.lore_comments to authenticated;
grant update(content) on public.lore_comments to authenticated;
grant all on public.lore_categories, public.lore_entries, public.lore_attachments, public.lore_comments to service_role;

alter table public.lore_categories enable row level security;
alter table public.lore_entries enable row level security;
alter table public.lore_attachments enable row level security;
alter table public.lore_comments enable row level security;

create or replace function public.can_read_lore_entry(_entry uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.lore_entries e
    where e.id = _entry
      and e.status = 'published'
      and e.published_at is not null
      and e.published_at <= now()
      and (
        e.visibility = 'public'
        or (e.visibility = 'restricted' and auth.uid() = any(e.allowed_users))
      )
  );
$$;
revoke execute on function public.can_read_lore_entry(uuid) from public, anon;
grant execute on function public.can_read_lore_entry(uuid) to authenticated;

create policy "lore categories read" on public.lore_categories
for select to authenticated using (true);
create policy "lore categories master write" on public.lore_categories
for all to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));

create policy "lore entries readable content only" on public.lore_entries
for select to authenticated
using (public.has_role(auth.uid(), 'master') or public.can_read_lore_entry(id));
create policy "lore entries master manage" on public.lore_entries
for all to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));

create policy "lore attachments readable with entry" on public.lore_attachments
for select to authenticated
using (public.has_role(auth.uid(), 'master') or public.can_read_lore_entry(entry_id));
create policy "lore attachments master manage" on public.lore_attachments
for all to authenticated
using (public.has_role(auth.uid(), 'master'))
with check (public.has_role(auth.uid(), 'master'));

create policy "lore comments visible with entry" on public.lore_comments
for select to authenticated
using (public.has_role(auth.uid(), 'master') or public.can_read_lore_entry(entry_id));
create policy "lore comments insert on readable entry" on public.lore_comments
for insert to authenticated
with check (
  user_id = auth.uid()
  and public.can_read_lore_entry(entry_id)
);
create policy "lore comments owner or master edit" on public.lore_comments
for update to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'master'))
with check (user_id = auth.uid() or public.has_role(auth.uid(), 'master'));
create policy "lore comments owner or master delete" on public.lore_comments
for delete to authenticated
using (user_id = auth.uid() or public.has_role(auth.uid(), 'master'));

create or replace function public.set_lore_comment_pinned(_comment uuid, _pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role(auth.uid(), 'master') then
    raise exception 'Apenas o Mestre pode fixar comentários';
  end if;
  update public.lore_comments set pinned = _pinned where id = _comment;
  if not found then raise exception 'Comentário não encontrado'; end if;
end;
$$;
revoke execute on function public.set_lore_comment_pinned(uuid, boolean) from public, anon;
grant execute on function public.set_lore_comment_pinned(uuid, boolean) to authenticated;

create or replace function public.touch_lore_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then new.updated_by := auth.uid(); end if;
  return new;
end;
$$;
create trigger lore_entries_touch_updated_at
before update on public.lore_entries
for each row execute function public.touch_lore_updated_at();
create trigger lore_comments_touch_updated_at
before update on public.lore_comments
for each row execute function public.touch_lore_updated_at();

insert into storage.buckets(id, name, public, file_size_limit)
values ('lore-files', 'lore-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

create policy "lore files readable with published entry" on storage.objects
for select to authenticated
using (
  bucket_id = 'lore-files'
  and exists (
    select 1 from public.lore_attachments a
    where a.storage_path = name
      and (public.has_role(auth.uid(), 'master') or public.can_read_lore_entry(a.entry_id))
  )
);
create policy "lore master upload files" on storage.objects
for insert to authenticated
with check (bucket_id = 'lore-files' and public.has_role(auth.uid(), 'master'));
create policy "lore master update files" on storage.objects
for update to authenticated
using (bucket_id = 'lore-files' and public.has_role(auth.uid(), 'master'))
with check (bucket_id = 'lore-files' and public.has_role(auth.uid(), 'master'));
create policy "lore master delete files" on storage.objects
for delete to authenticated
using (bucket_id = 'lore-files' and public.has_role(auth.uid(), 'master'));

insert into public.lore_categories(name, slug, description, sort_order) values
  ('História', 'historia', 'Eras, guerras e acontecimentos que moldaram o mundo.', 1),
  ('Personagens', 'personagens', 'Heróis, figuras históricas e personagens notáveis.', 2),
  ('Locais', 'locais', 'Reinos, cidades, ruínas e lugares de interesse.', 3),
  ('Facções', 'faccoes', 'Ordens, guildas, casas e organizações.', 4),
  ('Criaturas', 'criaturas', 'Bestiário e seres encontrados na campanha.', 5),
  ('Religiões', 'religioes', 'Deuses, cultos, ritos e crenças.', 6),
  ('Missões', 'missoes', 'Ganchos, objetivos e registros de aventuras.', 7),
  ('Documentos', 'documentos', 'Cartas, mapas, relatos e arquivos de referência.', 8)
on conflict (slug) do nothing;

-- Só a entrada da partida utiliza o servidor; toda a partida acontece no navegador.
create or replace function public.start_farkle_game()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare remaining_vigor integer;
begin
  perform public._spend_vigor(3);
  select vigor into remaining_vigor from public.profiles where id = auth.uid();
  return coalesce(remaining_vigor, 0);
end;
$$;
revoke execute on function public.start_farkle_game() from public, anon;
grant execute on function public.start_farkle_game() to authenticated;
