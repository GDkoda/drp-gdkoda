-- Bônus manuais de FA/FD e rolagens personalizadas persistentes por personagem.
alter table public.characters
  add column if not exists fa_bonus integer not null default 0,
  add column if not exists fd_bonus integer not null default 0,
  add column if not exists custom_rolls jsonb not null default '[]'::jsonb;

alter table public.characters
  drop constraint if exists characters_custom_rolls_is_array;
alter table public.characters
  add constraint characters_custom_rolls_is_array
  check (jsonb_typeof(custom_rolls) = 'array');
