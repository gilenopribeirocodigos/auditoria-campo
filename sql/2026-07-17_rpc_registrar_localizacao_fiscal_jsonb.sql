-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: sobrecarga (overload) de dev/public.registrar_localizacao_fiscal
-- que aceita um único parâmetro jsonb, pra cobrir as posições gravadas via
-- BackgroundGeolocation.insertLocation() no app Android (rastreio.js).
--
-- Motivo: o `locationTemplate` configurado no SDK (que "achata" a posição em
-- {p_lat, p_lng, p_precisao, p_created_at, ...}) só é aplicado às posições
-- capturadas pelo próprio motor de rastreio (contínuo/getCurrentPosition).
-- Posições inseridas manualmente via insertLocation() são enviadas no
-- formato BRUTO padrão do SDK (timestamp, coords: {latitude, longitude,
-- accuracy, ...}, extras: {...}, activity, battery, uuid, etc.) — por isso
-- a função de 6 parâmetros nomeados (2026-07-15_rpc_...sql) não batia,
-- devolvendo erro 404 PGRST202.
--
-- Esta sobrecarga não duplica a lógica de INSERT — só extrai os campos do
-- JSON bruto e repassa pra função original (que continua sendo usada, sem
-- mudança, pelas posições que já vêm no formato achatado via locationTemplate).

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE OR REPLACE FUNCTION dev.registrar_localizacao_fiscal(payload jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM dev.registrar_localizacao_fiscal(
    (payload->'extras'->>'p_fiscal_login'),
    (payload->'extras'->>'p_fiscal_nome'),
    (payload->'coords'->>'latitude')::double precision,
    (payload->'coords'->>'longitude')::double precision,
    (payload->'coords'->>'accuracy')::double precision,
    (payload->>'timestamp')::timestamptz
  );
END;
$$;

GRANT EXECUTE ON FUNCTION dev.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE OR REPLACE FUNCTION public.registrar_localizacao_fiscal(payload jsonb) RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.registrar_localizacao_fiscal(
    (payload->'extras'->>'p_fiscal_login'),
    (payload->'extras'->>'p_fiscal_nome'),
    (payload->'coords'->>'latitude')::double precision,
    (payload->'coords'->>'longitude')::double precision,
    (payload->'coords'->>'accuracy')::double precision,
    (payload->>'timestamp')::timestamptz
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.registrar_localizacao_fiscal(jsonb) TO anon, authenticated;
