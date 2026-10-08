-- Aplicar em ambos schemas: dev e public via Codex
--
-- Adiciona uc/os em "ocorrencias" (colunas opcionais, aditivas — ate aqui
-- UC/OS so ficavam dentro do texto de "descricao" da importacao em lote,
-- sem como consultar). A Abertura de Ocorrencia em Lote passa a usar
-- UC + OS como chave pra checar, antes de criar, se ja existe uma
-- Ocorrencia pra aquele mesmo UC+OS — se existir, a linha fica marcada
-- como "duplicada" e NAO vira Ocorrencia de novo (nem some: aparece na
-- tela de revisao avisando que ja existe, sem precisar de correcao).
--
-- "ocorrencias_importacao_pendentes" ja tinha uc/os desde a migracao
-- original (sql/2026-09-10_ocorrencias.sql) — essa aqui só espelha o
-- mesmo padrao na tabela "ocorrencias" (a Ocorrencia de verdade, ja
-- criada), que era o que faltava pra dar pra comparar.

alter table dev.ocorrencias add column if not exists uc text;
alter table dev.ocorrencias add column if not exists os text;
create index if not exists idx_dev_ocorrencias_uc_os on dev.ocorrencias (uc, os);

alter table public.ocorrencias add column if not exists uc text;
alter table public.ocorrencias add column if not exists os text;
create index if not exists idx_public_ocorrencias_uc_os on public.ocorrencias (uc, os);
