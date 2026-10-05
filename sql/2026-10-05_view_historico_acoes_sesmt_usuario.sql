-- Aplicar em "public" via Codex
--
-- A view vw_historico_acoes_sesmt (reporting ad hoc, criada direto em
-- produção — não existe em "dev" nem é usada pelo código do app) não trazia
-- quem fez o registro (fiscal/matricula_fiscal de sesmt_acoes). Acrescenta
-- USUARIO e MATRICULA_USUARIO no final da view (CREATE OR REPLACE VIEW só
-- permite ACRESCENTAR colunas no fim, sem reordenar/remover as existentes,
-- senão quebra o que já depende dela).
--
-- Definição original obtida via:
--   select pg_get_viewdef('public.vw_historico_acoes_sesmt'::regclass, true);
--
-- Registros antigos: fiscal/matricula_fiscal sempre foram gravados em
-- sesmt_acoes desde sempre (confirmado: 0 linhas sem esse dado, em dev e
-- public) — então assim que a view passa a expor essas colunas, os
-- registros antigos já aparecem preenchidos, sem precisar de backfill.

create or replace view public.vw_historico_acoes_sesmt as
SELECT COALESCE(a.numero_acao, 'LEGADO-'::text || a.id::text) AS numero_acao,
    a.regional,
        CASE a.tipo
            WHEN 'DIALOGO_SEGURANCA'::text THEN 'Diálogo de Segurança'::text
            WHEN 'TREINAMENTO'::text THEN 'Treinamento'::text
            WHEN 'RECICLAGEM'::text THEN 'Reciclagem'::text
            ELSE a.tipo
        END AS tipo_registro,
    a.tema,
    a.motivo,
    a.data_registro AS data,
    a.hora_registro AS hora,
    a.endereco AS endereco_reuniao,
    p.value ->> 'nome'::text AS nome,
    p.value ->> 'chapa'::text AS matricula,
    sp.cpf,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL THEN 'SIM'::text
            ELSE 'NÃO'::text
        END AS assinatura,
    p.value ->> 'endereco_assinatura'::text AS endereco_assinatura,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL AND a.lat IS NOT NULL AND a.lng IS NOT NULL AND (p.value ->> 'lat'::text) IS NOT NULL AND (p.value ->> 'lng'::text) IS NOT NULL THEN round(((6371000 * 2)::double precision * atan2(sqrt((sin(radians(((p.value ->> 'lat'::text)::double precision) - a.lat) / 2::double precision) ^ 2::double precision) + cos(radians(a.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - a.lng) / 2::double precision) ^ 2::double precision)), sqrt(1::double precision - ((sin(radians(((p.value ->> 'lat'::text)::double precision) - a.lat) / 2::double precision) ^ 2::double precision) + cos(radians(a.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - a.lng) / 2::double precision) ^ 2::double precision)))))::numeric)
            ELSE NULL::numeric
        END AS distancia_assinatura_m,
    upper(p.value ->> 'modo'::text) AS modalidade,
    a.fiscal AS usuario,
    a.matricula_fiscal AS matricula_usuario
   FROM sesmt_acoes a
     LEFT JOIN LATERAL jsonb_array_elements(a.participantes) p(value) ON true
     LEFT JOIN sesmt_pessoas sp ON sp.id = NULLIF(p.value ->> 'pessoa_id'::text, ''::text)::bigint;
