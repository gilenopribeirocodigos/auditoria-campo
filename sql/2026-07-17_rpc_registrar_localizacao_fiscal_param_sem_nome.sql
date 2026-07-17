-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: corrige registrar_localizacao_fiscal pra usar um
-- parâmetro jsonb SEM NOME — o PostgREST só faz o "encaixe automático de
-- parâmetro único" (usado quando o corpo do POST não bate com nenhuma
-- função de parâmetros nomeados) se a função tiver EXATAMENTE UM parâmetro
-- e ele for SEM NOME. A versão anterior (2026-07-17_..._unificada.sql)
-- declarava `payload jsonb` (COM nome) — por isso continuava dando 404
-- PGRST202 mesmo com a função existindo no banco, mesmo depois de forçar
-- reload de schema e até depois de reiniciar o projeto inteiro (nenhum
-- desses resolveria, já que a causa nunca foi cache).
--
-- Dentro do corpo da função, um parâmetro sem nome é referenciado como
-- $1 (ou apelidado com ALIAS FOR $1, que é o que fazemos abaixo).

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
DROP FUNCTION IF EXISTS dev.registrar_localizacao_fiscal(jsonb);

CREATE FUNCTION dev.registrar_localizacao_fiscal(jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  payload ALIAS FOR $1;
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
DROP FUNCTION IF EXISTS public.registrar_localizacao_fiscal(jsonb);

CREATE FUNCTION public.registrar_localizacao_fiscal(jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  payload ALIAS FOR $1;
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
