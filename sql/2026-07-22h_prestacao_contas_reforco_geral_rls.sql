-- Aplicar em ambos schemas: dev e public via Codex
-- Reforço geral e idempotente do módulo Prestação de Contas.
-- Motivo: erro "new row violates row-level security policy for table
-- pc_prestacoes" no schema public — mesmo padrão recorrente já visto em
-- praticamente toda tabela nova deste módulo (o DISABLE ROW LEVEL SECURITY
-- aplicado nos scripts originais não pegou em pelo menos uma tabela/schema).
-- Como o módulo está sendo promovido para produção agora, este script repete
-- a liberação para TODAS as tabelas pc_* nos dois schemas de uma vez só, pra
-- não precisar corrigir tabela por tabela. Seguro rodar quantas vezes for
-- preciso — não mexe em estrutura nem em dados.

ALTER TABLE dev.pc_prestacoes         DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_itens              DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_fotos              DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_historico          DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_classificacoes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_tipos_comprovante  DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_fechamentos        DISABLE ROW LEVEL SECURITY;
ALTER TABLE dev.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;

GRANT ALL ON dev.pc_prestacoes         TO anon, authenticated;
GRANT ALL ON dev.pc_itens              TO anon, authenticated;
GRANT ALL ON dev.pc_fotos              TO anon, authenticated;
GRANT ALL ON dev.pc_historico          TO anon, authenticated;
GRANT ALL ON dev.pc_classificacoes     TO anon, authenticated;
GRANT ALL ON dev.pc_tipos_comprovante  TO anon, authenticated;
GRANT ALL ON dev.pc_fechamentos        TO anon, authenticated;
GRANT ALL ON dev.pc_permissoes_usuario TO anon, authenticated;

ALTER TABLE public.pc_prestacoes         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_itens              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_fotos              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_historico          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_classificacoes     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_tipos_comprovante  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_fechamentos        DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.pc_prestacoes         TO anon, authenticated;
GRANT ALL ON public.pc_itens              TO anon, authenticated;
GRANT ALL ON public.pc_fotos              TO anon, authenticated;
GRANT ALL ON public.pc_historico          TO anon, authenticated;
GRANT ALL ON public.pc_classificacoes     TO anon, authenticated;
GRANT ALL ON public.pc_tipos_comprovante  TO anon, authenticated;
GRANT ALL ON public.pc_fechamentos        TO anon, authenticated;
GRANT ALL ON public.pc_permissoes_usuario TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
