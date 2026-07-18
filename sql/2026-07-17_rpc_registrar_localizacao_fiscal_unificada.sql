-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: unifica registrar_localizacao_fiscal numa ÚNICA função
-- (só jsonb), substituindo as duas versões anteriores (6 parâmetros
-- nomeados + sobrecarga jsonb — ver 2026-07-15 e 2026-07-17_..._jsonb.sql).
--
-- Motivo: testado direto via curl contra o PostgREST (bypassando o app) —
-- com as DUAS versões coexistindo, o PostgREST resolve certinho a versão
-- de 6 parâmetros nomeados, mas NUNCA consegue resolver a versão jsonb
-- (sempre devolve 404 PGRST202, mesmo confirmando que a função existe no
-- banco e mesmo depois de forçar reload do schema cache). Ter duas
-- sobrecargas do mesmo nome parece bloquear o "encaixe automático" de
-- parâmetro único jsonb do PostgREST.
--
-- Fix: uma função só, que detecta pelo formato do payload:
--  - Se tiver a chave "coords" → formato bruto padrão do SDK (vem de
--    BackgroundGeolocation.insertLocation(), usado no "ponto garantido"
--    do heartbeat em rastreio.js).
--  - Senão → formato achatado do locationTemplate (rastreio contínuo e
--    getCurrentPosition normais).
-- Mesma lógica de INSERT de sempre, sem mudança nas tabelas.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
DROP FUNCTION IF EXISTS dev.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz);
DROP FUNCTION IF EXISTS dev.registrar_localizacao_fiscal(jsonb);

CREATE OR REPLACE FUNCTION dev.registrar_localizacao_fiscal(payload jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fiscal_login text;
  v_fiscal_nome  text;
  v_lat          double precision;
  v_lng          double precision;
  v_precisao     double precision;
  v_created_at   timestamptz;
BEGIN
  IF payload ? 'coords' THEN
    v_fiscal_login := payload->'extras'->>'p_fiscal_login';
    v_fiscal_nome  := payload->'extras'->>'p_fiscal_nome';
    v_lat          := (payload->'coords'->>'latitude')::double precision;
    v_lng          := (payload->'coords'->>'longitude')::double precision;
    v_precisao     := (payload->'coords'->>'accuracy')::double precision;
    v_created_at   := (payload->>'timestamp')::timestamptz;
  ELSE
    v_fiscal_login := payload->>'p_fiscal_login';
    v_fiscal_nome  := payload->>'p_fiscal_nome';
    v_lat          := (payload->>'p_lat')::double precision;
    v_lng          := (payload->>'p_lng')::double precision;
    v_precisao     := (payload->>'p_precisao')::double precision;
    v_created_at   := (payload->>'p_created_at')::timestamptz;
  END IF;

  INSERT INTO dev.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (v_fiscal_login, v_fiscal_nome, v_lat, v_lng, v_precisao, v_created_at);

  INSERT INTO dev.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (v_fiscal_login, v_fiscal_nome, v_lat, v_lng, v_precisao, v_created_at)
  ON CONFLICT (fiscal_login) DO UPDATE SET
    fiscal_nome  = EXCLUDED.fiscal_nome,
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    precisao     = EXCLUDED.precisao,
    ultimo_visto = EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION dev.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;

-- =========================
-- PRODUÇÃO: schema public
-- =========================
DROP FUNCTION IF EXISTS public.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz);
DROP FUNCTION IF EXISTS public.registrar_localizacao_fiscal(jsonb);

CREATE OR REPLACE FUNCTION public.registrar_localizacao_fiscal(payload jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_fiscal_login text;
  v_fiscal_nome  text;
  v_lat          double precision;
  v_lng          double precision;
  v_precisao     double precision;
  v_created_at   timestamptz;
BEGIN
  IF payload ? 'coords' THEN
    v_fiscal_login := payload->'extras'->>'p_fiscal_login';
    v_fiscal_nome  := payload->'extras'->>'p_fiscal_nome';
    v_lat          := (payload->'coords'->>'latitude')::double precision;
    v_lng          := (payload->'coords'->>'longitude')::double precision;
    v_precisao     := (payload->'coords'->>'accuracy')::double precision;
    v_created_at   := (payload->>'timestamp')::timestamptz;
  ELSE
    v_fiscal_login := payload->>'p_fiscal_login';
    v_fiscal_nome  := payload->>'p_fiscal_nome';
    v_lat          := (payload->>'p_lat')::double precision;
    v_lng          := (payload->>'p_lng')::double precision;
    v_precisao     := (payload->>'p_precisao')::double precision;
    v_created_at   := (payload->>'p_created_at')::timestamptz;
  END IF;

  INSERT INTO public.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (v_fiscal_login, v_fiscal_nome, v_lat, v_lng, v_precisao, v_created_at);

  INSERT INTO public.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (v_fiscal_login, v_fiscal_nome, v_lat, v_lng, v_precisao, v_created_at)
  ON CONFLICT (fiscal_login) DO UPDATE SET
    fiscal_nome  = EXCLUDED.fiscal_nome,
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    precisao     = EXCLUDED.precisao,
    ultimo_visto = EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;
