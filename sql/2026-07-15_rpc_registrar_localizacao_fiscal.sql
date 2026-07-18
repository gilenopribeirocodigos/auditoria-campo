-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: função RPC que grava, num único POST, tanto a trilha
-- histórica (localizacoes) quanto o heartbeat de presença (fiscais_presenca).
-- Criada pra uso do plugin nativo Android da Transistor Software
-- (@transistorsoft/capacitor-background-geolocation), que faz o POST direto
-- do SDK nativo (sem depender do JS/WebView) configurando `url` = este
-- endpoint RPC via PostgREST (/rest/v1/rpc/registrar_localizacao_fiscal).
-- Mantém as duas tabelas e toda a lógica existente do mapa/Gantt inalteradas.
--
-- [CORREÇÃO 2] Parâmetros renomeados com prefixo "p_" — os nomes originais
-- (fiscal_login, lat, lng, etc.) batiam exatamente com os nomes das colunas
-- das tabelas, causando erro 42702 "column reference ... is ambiguous" em
-- todo INSERT (o Postgres não sabia se era o parâmetro ou a coluna).
--
-- [CORREÇÃO 3] CREATE OR REPLACE FUNCTION não permite renomear parâmetros
-- existentes (erro 42P13 "cannot change name of input parameter") — precisa
-- dar DROP na função antiga primeiro. Os DROP abaixo são seguros: é só uma
-- função (sem dados), recriada na sequência.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
DROP FUNCTION IF EXISTS dev.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz);

CREATE OR REPLACE FUNCTION dev.registrar_localizacao_fiscal(
  p_fiscal_login text,
  p_fiscal_nome text,
  p_lat double precision,
  p_lng double precision,
  p_precisao double precision,
  p_created_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO dev.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (p_fiscal_login, p_fiscal_nome, p_lat, p_lng, p_precisao, p_created_at);

  INSERT INTO dev.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (p_fiscal_login, p_fiscal_nome, p_lat, p_lng, p_precisao, p_created_at)
  ON CONFLICT (fiscal_login) DO UPDATE SET
    fiscal_nome  = EXCLUDED.fiscal_nome,
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    precisao     = EXCLUDED.precisao,
    ultimo_visto = EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION dev.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz) TO anon, authenticated;

-- =========================
-- PRODUÇÃO: schema public
-- =========================
DROP FUNCTION IF EXISTS public.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz);

CREATE OR REPLACE FUNCTION public.registrar_localizacao_fiscal(
  p_fiscal_login text,
  p_fiscal_nome text,
  p_lat double precision,
  p_lng double precision,
  p_precisao double precision,
  p_created_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (p_fiscal_login, p_fiscal_nome, p_lat, p_lng, p_precisao, p_created_at);

  INSERT INTO public.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (p_fiscal_login, p_fiscal_nome, p_lat, p_lng, p_precisao, p_created_at)
  ON CONFLICT (fiscal_login) DO UPDATE SET
    fiscal_nome  = EXCLUDED.fiscal_nome,
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    precisao     = EXCLUDED.precisao,
    ultimo_visto = EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz) TO anon, authenticated;
