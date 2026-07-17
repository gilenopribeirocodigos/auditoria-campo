-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: corrige registrar_localizacao_fiscal pra NUNCA deixar
-- fiscais_presenca.ultimo_visto voltar no tempo.
--
-- Bug encontrado testando direto na API (curl) contra dev.fiscais_presenca:
-- o Nailton aparecia "OFFLINE" no Ao Vivo mesmo com dev.localizacoes
-- recebendo pontos novos sem parar (ex.: 18:02 de hoje). Comparando a ORDEM
-- REAL de inserção (coluna id) com o valor de created_at de cada linha,
-- ficou claro que o celular estava enviando, com atraso, um lote de pontos
-- "atrasados" (capturados por volta de 14:53-15:04) DEPOIS de pontos com
-- horário mais recente (17:59, 18:02) já terem chegado — provavelmente
-- pontos que ficaram presos na fila nativa do SDK (SQLite) ou na fila
-- offline (IndexedDB) por um tempo e só foram reenviados agora.
--
-- Como o UPSERT em fiscais_presenca fazia
--   ON CONFLICT (fiscal_login) DO UPDATE SET ultimo_visto = EXCLUDED.ultimo_visto
-- sem nenhuma proteção de ordem, o último ponto ATRASADO (mas inserido por
-- último) sobrescrevia ultimo_visto com um horário de 3h atrás, fazendo o
-- fiscal cair pra "OFFLINE" no mapa Ao Vivo mesmo estando ativo de verdade.
--
-- Fix: o UPDATE só acontece se o novo ponto for mais recente do que o que
-- já está gravado (WHERE fiscais_presenca.ultimo_visto < EXCLUDED.ultimo_visto).
-- Pontos atrasados continuam sendo gravados normalmente em `localizacoes`
-- (histórico/Gantt não muda, cada ponto já é ordenado por created_at na
-- hora de montar os segmentos) — só o "último visto" deixa de retroceder.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE OR REPLACE FUNCTION dev.registrar_localizacao_fiscal(jsonb) RETURNS void
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
    ultimo_visto = EXCLUDED.ultimo_visto
  WHERE dev.fiscais_presenca.ultimo_visto < EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION dev.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE OR REPLACE FUNCTION public.registrar_localizacao_fiscal(jsonb) RETURNS void
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
    ultimo_visto = EXCLUDED.ultimo_visto
  WHERE public.fiscais_presenca.ultimo_visto < EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;
