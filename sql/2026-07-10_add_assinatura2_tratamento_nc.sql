-- Aplicar em ambos schemas: dev e public via Codex
-- Tratamento de Pós Serviço: quando a auditoria original tinha 2
-- eletricistas, o tratamento da NC deve coletar a assinatura dos dois,
-- nao so do Eletricista 1. Colunas novas para o 2o eletricista.

alter table dev.auditorias_nao_conformes
  add column if not exists tratamento_assinatura2_url text,
  add column if not exists tratamento_assinatura2_nome text;

alter table public.auditorias_nao_conformes
  add column if not exists tratamento_assinatura2_url text,
  add column if not exists tratamento_assinatura2_nome text;

notify pgrst, 'reload schema';
