-- Aplicar em ambos schemas: dev e public via Codex
--
-- Adiciona a coluna registro_execucao em ocorrencias — parte dos "Dados
-- Técnicos" do Tratamento de Retrabalho (tipo_ocorrencia = 'OCORRENCIA'),
-- junto com uc/os/data_conclusao que já existiam. Vem preenchida pela
-- importação em lote (planilha TOA) ou digitada manualmente no formulário
-- de abertura.

ALTER TABLE dev.ocorrencias    ADD COLUMN IF NOT EXISTS registro_execucao text;
ALTER TABLE public.ocorrencias ADD COLUMN IF NOT EXISTS registro_execucao text;
