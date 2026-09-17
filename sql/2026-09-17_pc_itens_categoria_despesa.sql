-- Aplicar em ambos schemas: dev e public via Codex
-- CATEGORIA DA DESPESA no módulo Prestação de Contas: classifica cada item
-- lançado por quem ele deve ser alocado (colaborador, equipe/prefixo, viatura,
-- base operacional, terceiro ou administrativo/sem alocação).

ALTER TABLE dev.pc_itens
  ADD COLUMN IF NOT EXISTS categoria_despesa TEXT,
  ADD COLUMN IF NOT EXISTS colaborador_1     TEXT,
  ADD COLUMN IF NOT EXISTS colaborador_2     TEXT,
  ADD COLUMN IF NOT EXISTS alocacao          TEXT;

ALTER TABLE public.pc_itens
  ADD COLUMN IF NOT EXISTS categoria_despesa TEXT,
  ADD COLUMN IF NOT EXISTS colaborador_1     TEXT,
  ADD COLUMN IF NOT EXISTS colaborador_2     TEXT,
  ADD COLUMN IF NOT EXISTS alocacao          TEXT;
