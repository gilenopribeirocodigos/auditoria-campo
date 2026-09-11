-- Aplicar em ambos schemas: dev e public via Codex
--
-- Complementa sql/2026-09-10_ocorrencias.sql: a tela de Abertura de
-- Ocorrência passou a capturar data/hora de abertura e GPS/endereço
-- automaticamente (mesmo padrão de src/steps/S1Identificacao.jsx e
-- R2Identificacao.jsx) — precisa de colunas novas pra gravar isso.
-- criado_em (já existente) continua sendo o timestamp real do servidor;
-- data_abertura/hora_abertura são o que o app capturou no aparelho no
-- momento do preenchimento (podem divergir poucos minutos em cenário
-- offline, já que só sincronizam depois).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.ocorrencias add column if not exists data_abertura date;
alter table dev.ocorrencias add column if not exists hora_abertura text;
alter table dev.ocorrencias add column if not exists endereco text;
alter table dev.ocorrencias add column if not exists lat double precision;
alter table dev.ocorrencias add column if not exists lng double precision;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.ocorrencias add column if not exists data_abertura date;
alter table public.ocorrencias add column if not exists hora_abertura text;
alter table public.ocorrencias add column if not exists endereco text;
alter table public.ocorrencias add column if not exists lat double precision;
alter table public.ocorrencias add column if not exists lng double precision;

notify pgrst, 'reload schema';
