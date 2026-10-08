-- Aplicar em ambos schemas: dev e public via Codex
--
-- Adiciona uc/os/data_conclusao em "ocorrencias" (colunas opcionais,
-- aditivas — ate aqui esses dados so ficavam dentro do texto de
-- "descricao" da importacao em lote, sem como consultar). A Abertura de
-- Ocorrencia em Lote passa a usar UC + OS + DATAC CONCLUSAO (só a data,
-- sem a hora) como chave composta pra checar, antes de criar, se ja
-- existe uma Ocorrencia pra aquela mesma UC+OS+data de conclusao — se
-- existir, a linha fica marcada como "duplicada" e NAO vira Ocorrencia de
-- novo (nem some: aparece na tela de revisao avisando que ja existe, sem
-- precisar de correcao).
--
-- "ocorrencias_importacao_pendentes" ja tinha uc/os/data_conclusao desde a
-- migracao original (sql/2026-09-10_ocorrencias.sql) — essa aqui só
-- espelha o mesmo padrao na tabela "ocorrencias" (a Ocorrencia de
-- verdade, ja criada), que era o que faltava pra dar pra comparar.
-- data_conclusao aqui guarda só a data (DD/MM/AAAA), nunca a hora, mesmo
-- que a planilha do TOA traga hora junto — a comparacao de duplicidade
-- ignora horario.

alter table dev.ocorrencias add column if not exists uc text;
alter table dev.ocorrencias add column if not exists os text;
alter table dev.ocorrencias add column if not exists data_conclusao text;
drop index if exists dev.idx_dev_ocorrencias_uc_os;
create index if not exists idx_dev_ocorrencias_uc_os_data on dev.ocorrencias (uc, os, data_conclusao);

alter table public.ocorrencias add column if not exists uc text;
alter table public.ocorrencias add column if not exists os text;
alter table public.ocorrencias add column if not exists data_conclusao text;
drop index if exists public.idx_public_ocorrencias_uc_os;
create index if not exists idx_public_ocorrencias_uc_os_data on public.ocorrencias (uc, os, data_conclusao);
