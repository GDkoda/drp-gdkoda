-- Oráculo dos Enigmas: prazo real de 60 segundos validado pelo banco.
begin;

alter table public.puzzle_sessions
  add column if not exists expires_at timestamptz;

-- Partidas antigas ficam expiradas em relação ao instante de criação.
update public.puzzle_sessions
set expires_at = created_at + interval '1 minute'
where expires_at is null;

alter table public.puzzle_sessions
  alter column expires_at set default (now() + interval '1 minute'),
  alter column expires_at set not null;


-- Preflight para o cliente confirmar que a regra de 60 segundos está ativa
-- antes de gastar o vigor da tentativa.
create or replace function public.get_puzzle_time_limit_seconds()
returns integer
language sql
stable
security definer
set search_path = public
as 'select 60;';

revoke all on function public.get_puzzle_time_limit_seconds() from public, anon;
grant execute on function public.get_puzzle_time_limit_seconds() to authenticated;


-- Inicia o enigma e devolve o prazo oficial calculado pelo servidor.
create or replace function public.start_puzzle()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kind integer;
  a integer;
  b integer;
  c integer;
  q text;
  ans text;
  sid uuid;
  v_expires_at timestamptz;
  v_server_now timestamptz;
  pz public.puzzles;
  rw integer;
begin
  if auth.uid() is null then
    raise exception 'Faça login para iniciar um enigma';
  end if;

  perform public._spend_vigor(1);

  select puzzle_reward
    into rw
    from public.game_settings
    where id = 1;

  if exists (select 1 from public.puzzles where active)
     and random() < 0.6 then
    select *
      into pz
      from public.puzzles
      where active
      order by random()
      limit 1;

    q := pz.question;
    ans := pz.answer;
    rw := coalesce(pz.reward, rw);
  else
    kind := floor(random() * 3);

    if kind = 0 then
      a := 1 + floor(random() * 9);
      b := 2 + floor(random() * 4);
      q := format(
        'Qual o próximo número da sequência rúnica? %s, %s, %s, %s, ?',
        a, a*b, a*b*b, a*b*b*b
      );
      ans := (a*b*b*b*b)::text;
    elsif kind = 1 then
      a := 2 + floor(random() * 8);
      b := 3 + floor(random() * 8);
      c := 1 + floor(random() * 9);
      q := format(
        'Um mercador tem %s sacos com %s moedas cada e gasta %s. Quantas moedas restam?',
        a, b, c
      );
      ans := (a*b-c)::text;
    else
      a := 1 + floor(random() * 20);
      b := 1 + floor(random() * 20);
      q := format(
        'O guardião diz: "Pensei num número. Somando %s a ele obtenho %s vezes 2." Que número é?',
        a, a+b
      );
      ans := ((a+b)*2-a)::text;
    end if;
  end if;

  insert into public.puzzle_sessions(user_id, answer, reward)
  values (auth.uid(), ans, rw)
  returning id, expires_at
  into sid, v_expires_at;

  v_server_now := clock_timestamp();

  return jsonb_build_object(
    'id', sid,
    'question', q,
    'expiresAt', v_expires_at,
    'serverNow', v_server_now
  );
end;
$$;


-- Uma resposta após o prazo também encerra a sessão como derrota.
create or replace function public.solve_puzzle(_id uuid, _answer text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.puzzle_sessions;
  ok boolean;
  rw integer;
begin
  if auth.uid() is null then
    raise exception 'Faça login para responder ao enigma';
  end if;

  select *
    into s
    from public.puzzle_sessions
    where id = _id
      and user_id = auth.uid()
    for update;

  if not found or s.solved is not null then
    raise exception 'Enigma inválido ou já respondido';
  end if;

  if s.expires_at <= clock_timestamp() then
    update public.puzzle_sessions
      set solved = false
      where id = _id;

    return jsonb_build_object(
      'correct', false,
      'answer', null,
      'reward', 0,
      'expired', true
    );
  end if;

  ok := lower(trim(_answer)) = lower(trim(s.answer));
  rw := coalesce(s.reward, 15);

  update public.puzzle_sessions
    set solved = ok
    where id = _id;

  if ok then
    perform public._reward(rw, 'enigma', 'Enigma resolvido');
  end if;

  return jsonb_build_object(
    'correct', ok,
    'answer', s.answer,
    'reward', case when ok then rw else 0 end,
    'expired', false
  );
end;
$$;


-- O navegador chama esta RPC ao zerar o cronômetro.
-- O servidor confirma o prazo antes de registrar a derrota.
create or replace function public.expire_puzzle(_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.puzzle_sessions;
begin
  if auth.uid() is null then
    raise exception 'Faça login para encerrar o enigma';
  end if;

  select *
    into s
    from public.puzzle_sessions
    where id = _id
      and user_id = auth.uid()
    for update;

  if not found or s.solved is not null then
    raise exception 'Enigma inválido ou já encerrado';
  end if;

  if s.expires_at > clock_timestamp() then
    return jsonb_build_object(
      'expired', false,
      'expiresAt', s.expires_at,
      'serverNow', clock_timestamp()
    );
  end if;

  update public.puzzle_sessions
    set solved = false
    where id = _id;

  return jsonb_build_object('expired', true);
end;
$$;


revoke all on function public.get_puzzle_time_limit_seconds() from public, anon;
revoke all on function public.start_puzzle() from public, anon;
revoke all on function public.solve_puzzle(uuid, text) from public, anon;
revoke all on function public.expire_puzzle(uuid) from public, anon;

grant execute on function public.get_puzzle_time_limit_seconds() to authenticated;
grant execute on function public.start_puzzle() to authenticated;
grant execute on function public.solve_puzzle(uuid, text) to authenticated;
grant execute on function public.expire_puzzle(uuid) to authenticated;

commit;

-- Verificação:
-- select column_name, column_default
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'puzzle_sessions'
--   and column_name = 'expires_at';
--
-- select proname
-- from pg_proc p
-- join pg_namespace n on n.oid = p.pronamespace
-- where n.nspname = 'public'
--   and proname in ('start_puzzle', 'solve_puzzle', 'expire_puzzle')
-- order by proname;
