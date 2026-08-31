-- Aplicar em ambos schemas: dev e public via Codex
--
-- Amplia sesmt_pessoas com os campos do arquivo de efetivo usado na carga
-- (CODSITUACAO, CODSECAO, DATAADMISSAO, DTTRANSFERENCIA, DATADEMISSAO,
-- PISPASEP, CPF) e adiciona a coluna REGIONAL, derivada em código (não em
-- SQL) a partir dos 3 primeiros grupos de CODSECAO:
--   02.03.01 -> METROPOLITANA
--   02.03.02 -> NORTE
--   02.03.03 a 02.03.08 -> SUL
-- REGIONAL é usada pra separar as pessoas na carga/assinatura por regional.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_pessoas add column if not exists codsituacao     text;
alter table dev.sesmt_pessoas add column if not exists codsecao       text;
alter table dev.sesmt_pessoas add column if not exists regional       text;
alter table dev.sesmt_pessoas add column if not exists data_admissao  date;
alter table dev.sesmt_pessoas add column if not exists dt_transferencia date;
alter table dev.sesmt_pessoas add column if not exists data_demissao  date;
alter table dev.sesmt_pessoas add column if not exists pispasep       text;
alter table dev.sesmt_pessoas add column if not exists cpf            text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_pessoas add column if not exists codsituacao     text;
alter table public.sesmt_pessoas add column if not exists codsecao       text;
alter table public.sesmt_pessoas add column if not exists regional       text;
alter table public.sesmt_pessoas add column if not exists data_admissao  date;
alter table public.sesmt_pessoas add column if not exists dt_transferencia date;
alter table public.sesmt_pessoas add column if not exists data_demissao  date;
alter table public.sesmt_pessoas add column if not exists pispasep       text;
alter table public.sesmt_pessoas add column if not exists cpf            text;

notify pgrst, 'reload schema';
