-- Aplicar em ambos schemas: dev e public via Codex
--
-- Adiciona a localizacao da PROPRIA acao (onde o fiscal esta fazendo o
-- Dialogo de Seguranca/Treinamento/Reciclagem) em sesmt_acoes — ate agora
-- so existia GPS por PARTICIPANTE (capturado na hora de cada assinatura),
-- sem um "endereco da reuniao" pra comparar com onde cada um assinou.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_acoes add column if not exists lat double precision;
alter table dev.sesmt_acoes add column if not exists lng double precision;
alter table dev.sesmt_acoes add column if not exists endereco text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_acoes add column if not exists lat double precision;
alter table public.sesmt_acoes add column if not exists lng double precision;
alter table public.sesmt_acoes add column if not exists endereco text;

notify pgrst, 'reload schema';
