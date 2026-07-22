-- Aplicar em ambos schemas: dev e public via Codex
-- Correção: mesmo problema já visto em pc_itens — o DISABLE ROW LEVEL
-- SECURITY do script anterior (2026-07-21d_prestacao_contas_historico.sql)
-- não pegou em pc_historico. Idempotente, seguro rodar de novo.

ALTER TABLE dev.pc_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_historico TO anon, authenticated;

ALTER TABLE public.pc_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_historico TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
