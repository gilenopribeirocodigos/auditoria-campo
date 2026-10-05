-- Aplicar em ambos schemas: dev e public via Codex
--
-- "Abertura de Ocorrência" não tinha campo de Motivo (mesmo padrão já usado
-- nos demais Registros Operacionais — Alinhamento, Diálogo de Segurança,
-- Treinamento, Feedback, Reunião, Disciplinar — cadastrado em
-- motivos_registros_operacionais e selecionado em R4Conteudo.jsx). Agora
-- "OCORRENCIA" também pode ter motivos cadastrados ali (não precisa de
-- migração — tipo_registro é texto livre, sem constraint).
--
-- Acrescenta a coluna motivo em:
--  - ocorrencias (abertura manual e em lote)
--  - ocorrencias_importacao_pendentes (preserva o motivo escolhido na
--    importação em lote até a pendência ser corrigida e aberta)

alter table dev.ocorrencias add column if not exists motivo text;
alter table dev.ocorrencias_importacao_pendentes add column if not exists motivo text;

alter table public.ocorrencias add column if not exists motivo text;
alter table public.ocorrencias_importacao_pendentes add column if not exists motivo text;

notify pgrst, 'reload schema';
