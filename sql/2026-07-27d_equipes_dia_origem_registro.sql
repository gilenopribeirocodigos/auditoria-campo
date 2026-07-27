-- Aplicar em ambos schemas: dev e public via Codex
-- Nova coluna em equipes_dia pra diferenciar frequência registrada
-- manualmente (usuário clicou Presente/Ausente) da registrada em lote via
-- extração do SIGA (feature "🤖 Justificativa em Lote"). Default 'MANUAL'
-- preserva o histórico já existente (tudo que já foi salvo até aqui foi
-- manual).

ALTER TABLE dev.equipes_dia    ADD COLUMN IF NOT EXISTS origem_registro text NOT NULL DEFAULT 'MANUAL';
ALTER TABLE public.equipes_dia ADD COLUMN IF NOT EXISTS origem_registro text NOT NULL DEFAULT 'MANUAL';

notify pgrst, 'reload schema';
