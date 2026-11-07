-- Restore the character's PV and PM whenever a combat reaches a terminal state.
-- This is enforced at the database layer so wins, defeats, and future combat
-- termination paths all receive the same restoration without trusting the client.

create or replace function public._restore_character_after_combat()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status = 'active' and new.status in ('won', 'lost') then
    new.hero_pv := new.hero_max_pv;
    new.hero_pm := new.hero_max_pm;

    update public.characters
    set pv_current = new.hero_max_pv,
        pm_current = new.hero_max_pm
    where id = new.character_id
      and owner_id = new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists restore_character_after_combat on public.combat_sessions;

create trigger restore_character_after_combat
before update of status on public.combat_sessions
for each row
when (old.status = 'active' and new.status in ('won', 'lost'))
execute function public._restore_character_after_combat();

revoke all on function public._restore_character_after_combat() from public, anon, authenticated;
