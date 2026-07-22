-- Aplicar em ambos schemas: dev e public via Codex
-- Reforço idempotente: o DISABLE ROW LEVEL SECURITY do script 2026-07-22i
-- não pegou (mesmo padrão recorrente já visto em todas as outras tabelas
-- pc_* deste módulo). Este script só repete as mesmas instruções e pode
-- ser rodado quantas vezes for preciso.

ALTER TABLE dev.pc_formas_pagamento DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_formas_pagamento TO anon, authenticated;

ALTER TABLE public.pc_formas_pagamento DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_formas_pagamento TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
