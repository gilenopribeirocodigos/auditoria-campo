-- Reforço: motivos_registros_operacionais ficou com RLS habilitado (erro
-- "new row violates row-level security policy" ao tentar cadastrar um motivo),
-- mesmo com o DISABLE ROW LEVEL SECURITY já presente no script de criação
-- (2026-07-28d_motivos_registros_operacionais.sql) — mesmo padrão de bug já
-- visto várias vezes neste projeto com tabelas novas. Script idempotente,
-- seguro pra rodar de novo.

alter table dev.motivos_registros_operacionais disable row level security;
grant all on dev.motivos_registros_operacionais to anon, authenticated;
grant usage, select on sequence dev.motivos_registros_operacionais_id_seq to anon, authenticated;

alter table public.motivos_registros_operacionais disable row level security;
grant all on public.motivos_registros_operacionais to anon, authenticated;
grant usage, select on sequence public.motivos_registros_operacionais_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
