-- Aplicar em ambos schemas: dev e public via Codex
--
-- Padroniza registros_operacionais com o padrao ja usado em sesmt_acoes
-- (numero_acao/status/regional) e faz vw_historico_acoes_sesmt enxergar
-- tambem os registros tipo 'DS' (Dialogo de Seguranca) feitos em Registros
-- Operacionais, alem dos ja existentes em sesmt_acoes.
--
-- 3 colunas novas em registros_operacionais, todas opcionais/aditivas —
-- nao quebra nenhum insert/select existente:
--   numero_registro: numero unico (padrao REG-AAAAMMDD-HHMMSS-XXXX, mesmo
--     esquema de numero_acao do SESMT/numero_ocorrencia das Ocorrencias).
--   status: sempre 'CONCLUIDA' (Registro Operacional nao tem rascunho/
--     pendente — e gravado inteiro no fim do wizard). Tem DEFAULT, entao
--     linhas ja existentes sao preenchidas automaticamente pelo Postgres
--     ao rodar o ADD COLUMN (nao precisa de UPDATE separado).
--   regional: calculada no app a partir da matricula dos participantes
--     casada com estrutura_equipes (ver calcularRegionalPredominanteRegistro
--     em src/lib/registros.js) — registros antigos ficam com regional NULL,
--     sem problema (mesmo comportamento de uma acao SESMT sem participante
--     reconhecido).
--
-- vw_historico_acoes_sesmt vira um UNION ALL: sesmt_acoes (como ja era) +
-- registros_operacionais tipo 'DS'. Nomes de coluna ficam padronizados no
-- resultado da view (numero_acao/regional/matricula/etc.) mesmo a tabela de
-- origem usando nomes um pouco diferentes (observacoes/created_at/
-- matricula) — nao foi preciso renomear nada nas tabelas, so o SELECT da
-- view cuida do apelido. cpf fica NULL do lado de registros_operacionais
-- (participante de Registro Operacional nao tem vinculo com sesmt_pessoas).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.registros_operacionais add column if not exists numero_registro text;
alter table dev.registros_operacionais add column if not exists status text default 'CONCLUIDA';
alter table dev.registros_operacionais add column if not exists regional text;

create or replace view dev.vw_historico_acoes_sesmt as
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
   FROM dev.sesmt_acoes a
     LEFT JOIN LATERAL jsonb_array_elements(a.participantes) p(value) ON true
     LEFT JOIN dev.sesmt_pessoas sp ON sp.id = NULLIF(p.value ->> 'pessoa_id'::text, ''::text)::bigint

UNION ALL

SELECT COALESCE(r.numero_registro, 'REG-'::text || r.id::text) AS numero_acao,
    r.regional,
    'Diálogo de Segurança'::text AS tipo_registro,
    r.tema,
    r.motivo,
    r.data_registro AS data,
    r.hora_registro AS hora,
    r.endereco AS endereco_reuniao,
    p.value ->> 'nome'::text AS nome,
    p.value ->> 'matricula'::text AS matricula,
    NULL::text AS cpf,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL THEN 'SIM'::text
            ELSE 'NÃO'::text
        END AS assinatura,
    p.value ->> 'endereco_assinatura'::text AS endereco_assinatura,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL AND (p.value ->> 'lat'::text) IS NOT NULL AND (p.value ->> 'lng'::text) IS NOT NULL THEN round(((6371000 * 2)::double precision * atan2(sqrt((sin(radians(((p.value ->> 'lat'::text)::double precision) - r.lat) / 2::double precision) ^ 2::double precision) + cos(radians(r.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - r.lng) / 2::double precision) ^ 2::double precision)), sqrt(1::double precision - ((sin(radians(((p.value ->> 'lat'::text)::double precision) - r.lat) / 2::double precision) ^ 2::double precision) + cos(radians(r.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - r.lng) / 2::double precision) ^ 2::double precision)))))::numeric)
            ELSE NULL::numeric
        END AS distancia_assinatura_m,
    upper(p.value ->> 'modo'::text) AS modalidade,
    r.fiscal AS usuario,
    r.matricula_fiscal AS matricula_usuario
   FROM dev.registros_operacionais r
     LEFT JOIN LATERAL jsonb_array_elements(r.participantes) p(value) ON true
   WHERE r.tipo = 'DS';

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.registros_operacionais add column if not exists numero_registro text;
alter table public.registros_operacionais add column if not exists status text default 'CONCLUIDA';
alter table public.registros_operacionais add column if not exists regional text;

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
   FROM public.sesmt_acoes a
     LEFT JOIN LATERAL jsonb_array_elements(a.participantes) p(value) ON true
     LEFT JOIN public.sesmt_pessoas sp ON sp.id = NULLIF(p.value ->> 'pessoa_id'::text, ''::text)::bigint

UNION ALL

SELECT COALESCE(r.numero_registro, 'REG-'::text || r.id::text) AS numero_acao,
    r.regional,
    'Diálogo de Segurança'::text AS tipo_registro,
    r.tema,
    r.motivo,
    r.data_registro AS data,
    r.hora_registro AS hora,
    r.endereco AS endereco_reuniao,
    p.value ->> 'nome'::text AS nome,
    p.value ->> 'matricula'::text AS matricula,
    NULL::text AS cpf,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL THEN 'SIM'::text
            ELSE 'NÃO'::text
        END AS assinatura,
    p.value ->> 'endereco_assinatura'::text AS endereco_assinatura,
        CASE
            WHEN (p.value ->> 'assinatura_url'::text) IS NOT NULL AND r.lat IS NOT NULL AND r.lng IS NOT NULL AND (p.value ->> 'lat'::text) IS NOT NULL AND (p.value ->> 'lng'::text) IS NOT NULL THEN round(((6371000 * 2)::double precision * atan2(sqrt((sin(radians(((p.value ->> 'lat'::text)::double precision) - r.lat) / 2::double precision) ^ 2::double precision) + cos(radians(r.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - r.lng) / 2::double precision) ^ 2::double precision)), sqrt(1::double precision - ((sin(radians(((p.value ->> 'lat'::text)::double precision) - r.lat) / 2::double precision) ^ 2::double precision) + cos(radians(r.lat)) * cos(radians((p.value ->> 'lat'::text)::double precision)) * (sin(radians(((p.value ->> 'lng'::text)::double precision) - r.lng) / 2::double precision) ^ 2::double precision)))))::numeric)
            ELSE NULL::numeric
        END AS distancia_assinatura_m,
    upper(p.value ->> 'modo'::text) AS modalidade,
    r.fiscal AS usuario,
    r.matricula_fiscal AS matricula_usuario
   FROM public.registros_operacionais r
     LEFT JOIN LATERAL jsonb_array_elements(r.participantes) p(value) ON true
   WHERE r.tipo = 'DS';

grant select on dev.vw_historico_acoes_sesmt to anon, authenticated;
grant select on public.vw_historico_acoes_sesmt to anon, authenticated;

notify pgrst, 'reload schema';

-- Conferir depois de aplicar:
-- select count(*) from public.vw_historico_acoes_sesmt where tipo_registro = 'Diálogo de Segurança';
-- (deve ser maior que o total só de sesmt_acoes — agora inclui os registros
-- feitos em Registros Operacionais também)
