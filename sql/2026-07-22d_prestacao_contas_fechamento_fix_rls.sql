-- Aplicar em ambos schemas: dev e public via Codex
-- Correção: mesmo padrão de falha já visto em pc_itens/pc_historico/
-- pc_classificacoes — o DISABLE ROW LEVEL SECURITY do script anterior
-- (2026-07-22c_prestacao_contas_fechamento.sql) não pegou em
-- pc_fechamentos. Idempotente, seguro rodar de novo.

ALTER TABLE dev.pc_fechamentos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_fechamentos TO anon, authenticated;

ALTER TABLE public.pc_fechamentos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_fechamentos TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
