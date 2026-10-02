-- Aplicar em ambos schemas: dev e public via Codex
--
-- Correção: a tabela ocorrencias_importacao_pendentes (criada no script
-- 2026-10-02_ocorrencias_importacao_pendentes.sql) está rejeitando INSERT
-- com "new row violates row-level security policy" — ou seja, RLS está
-- ATIVA nela (sem nenhuma policy de INSERT), mesmo o script original já
-- tendo o DISABLE ROW LEVEL SECURITY. Rodando de novo pra garantir o
-- padrão do projeto (controle de acesso só na aplicação, sem RLS).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.ocorrencias_importacao_pendentes disable row level security;
grant all on dev.ocorrencias_importacao_pendentes to anon, authenticated;
grant usage, select on dev.ocorrencias_importacao_pendentes_id_seq to anon, authenticated;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.ocorrencias_importacao_pendentes disable row level security;
grant all on public.ocorrencias_importacao_pendentes to anon, authenticated;
grant usage, select on public.ocorrencias_importacao_pendentes_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
