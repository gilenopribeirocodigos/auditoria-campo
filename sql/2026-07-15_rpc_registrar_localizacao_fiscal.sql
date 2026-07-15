-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: função RPC que grava, num único POST, tanto a trilha
-- histórica (localizacoes) quanto o heartbeat de presença (fiscais_presenca).
-- Criada pra uso do plugin nativo Android da Transistor Software
-- (@transistorsoft/capacitor-background-geolocation), que faz o POST direto
-- do SDK nativo (sem depender do JS/WebView) configurando `url` = este
-- endpoint RPC via PostgREST (/rest/v1/rpc/registrar_localizacao_fiscal).
-- Mantém as duas tabelas e toda a lógica existente do mapa/Gantt inalteradas.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE OR REPLACE FUNCTION dev.registrar_localizacao_fiscal(
  fiscal_login text,
  fiscal_nome text,
  lat double precision,
  lng double precision,
  precisao double precision,
  created_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO dev.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (fiscal_login, fiscal_nome, lat, lng, precisao, created_at);

  INSERT INTO dev.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
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
CREATE OR REPLACE FUNCTION public.registrar_localizacao_fiscal(
  fiscal_login text,
  fiscal_nome text,
  lat double precision,
  lng double precision,
  precisao double precision,
  created_at timestamptz
) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.localizacoes (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  VALUES (fiscal_login, fiscal_nome, lat, lng, precisao, created_at);

  INSERT INTO public.fiscais_presenca (fiscal_login, fiscal_nome, lat, lng, precisao, ultimo_visto)
  VALUES (fiscal_login, fiscal_nome, lat, lng, precisao, created_at)
  ON CONFLICT (fiscal_login) DO UPDATE SET
    fiscal_nome  = EXCLUDED.fiscal_nome,
    lat          = EXCLUDED.lat,
    lng          = EXCLUDED.lng,
    precisao     = EXCLUDED.precisao,
    ultimo_visto = EXCLUDED.ultimo_visto;
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_localizacao_fiscal(text, text, double precision, double precision, double precision, timestamptz) TO anon, authenticated;
