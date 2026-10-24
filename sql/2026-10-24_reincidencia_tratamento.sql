-- Aplicar em ambos schemas: dev e public via Codex
--
-- Tratamento de Reincidência — fase 2 (tela "Tratamento de Não
-- Conformidades" ganha um 3º módulo "🔁 Reincidência", igual já existe
-- pra Ocorrências). Reaproveita as colunas de tratamento que já existem em
-- `ocorrencias` (status, tratamento_fotos_urls, tratamento_assinatura_*,
-- tratamento_assinatura2_*, tratado_por, tratado_por_nome, tratado_em) pra
-- guardar fotos de evidência e as assinaturas de ciência do Eletricista 1 e
-- do Eletricista 2 — mesma função tratarOcorrencia() já usa essas colunas.
--
-- As 5 colunas novas abaixo guardam as respostas do checklist específico de
-- Reincidência (perguntas 1 a 5 do checklist que o Gileno mandou), e as 2
-- últimas guardam o Termo de Ciência do Fiscal (assinatura própria do
-- fiscal que tratou, exigida pelo checklist — distinta da ciência dos
-- eletricistas). Todas ficam null nas linhas de Ocorrência comum e nas
-- linhas de Reincidência ainda pendentes.

ALTER TABLE dev.ocorrencias
  ADD COLUMN IF NOT EXISTS reincidencia_rede_inspecionada     boolean,
  ADD COLUMN IF NOT EXISTS reincidencia_acoes_equipe          text,
  ADD COLUMN IF NOT EXISTS reincidencia_leituras_eletricas    text,
  ADD COLUMN IF NOT EXISTS reincidencia_resolvido_definitivo  boolean,
  ADD COLUMN IF NOT EXISTS reincidencia_vulnerabilidades      text,
  ADD COLUMN IF NOT EXISTS reincidencia_termo_fiscal_nome     text,
  ADD COLUMN IF NOT EXISTS reincidencia_termo_fiscal_assinatura_url text;

ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS reincidencia_rede_inspecionada     boolean,
  ADD COLUMN IF NOT EXISTS reincidencia_acoes_equipe          text,
  ADD COLUMN IF NOT EXISTS reincidencia_leituras_eletricas    text,
  ADD COLUMN IF NOT EXISTS reincidencia_resolvido_definitivo  boolean,
  ADD COLUMN IF NOT EXISTS reincidencia_vulnerabilidades      text,
  ADD COLUMN IF NOT EXISTS reincidencia_termo_fiscal_nome     text,
  ADD COLUMN IF NOT EXISTS reincidencia_termo_fiscal_assinatura_url text;
