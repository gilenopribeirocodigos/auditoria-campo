-- Aplicar em ambos schemas: dev e public via Codex
-- Reforço idempotente: a DISABLE ROW LEVEL SECURITY do script 2026-07-22f
-- não surtiu efeito (mesmo padrão já visto em pc_itens, pc_historico,
-- pc_classificacoes/pc_tipos_comprovante e pc_fechamentos). Este script
-- só repete as mesmas instruções e pode ser rodado quantas vezes for preciso.

ALTER TABLE dev.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_permissoes_usuario TO anon, authenticated;

ALTER TABLE public.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_permissoes_usuario TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
