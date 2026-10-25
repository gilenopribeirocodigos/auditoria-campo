-- Aplicar em ambos schemas: dev e public via Codex
--
-- Novo tipo de registro "Tratamento de Reincidência" (fase 1 — só a forma de
-- lançar; a atribuição/tratamento dentro de Não Conformidades fica pra uma
-- fase posterior, combinada com o Gileno). Reaproveita a tabela `ocorrencias`
-- em vez de criar uma tabela nova, pra ganhar de graça toda a infraestrutura
-- já existente (fila offline, número único, permissões de quem vê o quê) e
-- deixar a integração futura com Tratamento de Não Conformidades mais simples.
--
-- `tipo_ocorrencia` distingue as duas origens dentro da mesma tabela:
--   'OCORRENCIA'   = Abertura de Ocorrência (fluxo de sempre)
--   'REINCIDENCIA' = Tratamento de Reincidência (novo)
-- Linha existente (lançada antes desta coluna existir) fica com o default
-- 'OCORRENCIA' — continua aparecendo normalmente em Tratamento de Não
-- Conformidades, sem precisar de nenhum UPDATE retroativo.
--
-- Os 7 campos novos (numero_oe, abrangencia, componente_pdf, alimentador_al,
-- reincidencia_r07/r30/r90) só são preenchidos quando tipo_ocorrencia =
-- 'REINCIDENCIA' — ficam null nas linhas de Ocorrência comum.

ALTER TABLE dev.ocorrencias
  ADD COLUMN IF NOT EXISTS tipo_ocorrencia   text NOT NULL DEFAULT 'OCORRENCIA',
  ADD COLUMN IF NOT EXISTS numero_oe         text,
  ADD COLUMN IF NOT EXISTS abrangencia       text,
  ADD COLUMN IF NOT EXISTS componente_pdf    text,
  ADD COLUMN IF NOT EXISTS alimentador_al    text,
  ADD COLUMN IF NOT EXISTS reincidencia_r07  text,
  ADD COLUMN IF NOT EXISTS reincidencia_r30  text,
  ADD COLUMN IF NOT EXISTS reincidencia_r90  text;

ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS tipo_ocorrencia   text NOT NULL DEFAULT 'OCORRENCIA',
  ADD COLUMN IF NOT EXISTS numero_oe         text,
  ADD COLUMN IF NOT EXISTS abrangencia       text,
  ADD COLUMN IF NOT EXISTS componente_pdf    text,
  ADD COLUMN IF NOT EXISTS alimentador_al    text,
  ADD COLUMN IF NOT EXISTS reincidencia_r07  text,
  ADD COLUMN IF NOT EXISTS reincidencia_r30  text,
  ADD COLUMN IF NOT EXISTS reincidencia_r90  text;
