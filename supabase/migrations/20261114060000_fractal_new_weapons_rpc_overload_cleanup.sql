-- Compatibilidade do RPC de início de expedição para as novas armas.
-- A migration 20261111010000 criou a assinatura de 3 argumentos. A migration
-- 20261114050000 adiciona a de 4 argumentos com _mission_id DEFAULT 1.
-- Remover a assinatura antiga evita resolução ambígua no PostgreSQL/PostgREST;
-- chamadas com 3 argumentos continuam sendo atendidas pelo novo parâmetro padrão.
begin;
drop function if exists public.start_fractal_run(integer, text, text);
commit;
