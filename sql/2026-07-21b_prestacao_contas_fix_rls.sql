-- Aplicar em ambos schemas: dev e public via Codex
-- Correção: o erro "new row violates row-level security policy" ao salvar um
-- item indica que o DISABLE ROW LEVEL SECURITY do script anterior
-- (2026-07-21_prestacao_contas.sql) não pegou em pelo menos uma das 3
-- tabelas — provavelmente a execução anterior parou antes de chegar nessas
-- linhas. Este script só repete esses comandos; é seguro rodar de novo
-- quantas vezes precisar (não mexe em estrutura nem em dados).

ALTER TABLE dev.pc_prestacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_prestacoes TO anon, authenticated;
ALTER TABLE dev.pc_itens DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_itens TO anon, authenticated;
ALTER TABLE dev.pc_fotos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_fotos TO anon, authenticated;

ALTER TABLE public.pc_prestacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_prestacoes TO anon, authenticated;
ALTER TABLE public.pc_itens DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_itens TO anon, authenticated;
ALTER TABLE public.pc_fotos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_fotos TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
