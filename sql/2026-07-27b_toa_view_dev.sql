-- Recria em dev (só teste) a view public.vw_toa_extracao_completa, que já
-- existe em produção. Mesma lógica do script anterior (2026-07-27): dev
-- está sendo criado agora, depois do public já existir, só pra permitir
-- testar. Definição da view copiada via pg_get_viewdef fornecido pelo
-- Gileno em 27/07/2026 — só troquei as tabelas sem schema (que resolviam
-- pra public) por dev.* explicitamente, pra apontar pras tabelas de teste
-- criadas no script anterior.

CREATE OR REPLACE VIEW dev.vw_toa_extracao_completa AS
SELECT l.id AS leitura_id,
    l.execucao_id,
    pr.id AS presenca_id,
    l.run_key,
    l.bloco,
    e.status AS status_execucao,
    e.arquivo_xlsx,
    e.inicio_em AS execucao_inicio_em,
    e.fim_em AS execucao_fim_em,
    COALESCE(l.data_extracao, pr.data_extracao, (l.coletado_em AT TIME ZONE 'America/Fortaleza'::text)::date, (e.inicio_em AT TIME ZONE 'America/Fortaleza'::text)::date) AS data_extracao,
    COALESCE(l.hora_extracao, pr.hora_extracao, to_char((l.coletado_em AT TIME ZONE 'America/Fortaleza'::text), 'HH24:MI:SS'::text), to_char((e.inicio_em AT TIME ZONE 'America/Fortaleza'::text), 'HH24:MI:SS'::text)) AS hora_extracao,
    l.coletado_em,
    pr.observado_em,
    l.localidade,
    l.recurso AS prefixo,
    l.login,
    l.logoff,
    l.inicio_almoco,
    l.fim_almoco,
    l.login_grade,
    l.logoff_grade,
    l.rota_detalhe,
    l.status_rota,
    l.placa_viatura,
    l.recurso_online,
    l.dados ->> 'STATUS_ROTA_DATA'::text AS status_rota_data,
    l.dados ->> 'STATUS_ROTA_HORA'::text AS status_rota_hora,
    l.dados ->> 'LOGIN_CARD'::text AS login_card,
    l.dados ->> 'LOGOFF_CARD'::text AS logoff_card,
    l.dados ->> 'LOGOFF_CARD_DATA'::text AS logoff_card_data,
    l.dados ->> 'QTD_ELETRICISTAS'::text AS qtd_eletricistas_card,
    l.dados ->> 'ORIGEM_EXTRACAO'::text AS origem_extracao,
    pr.pessoa_id,
    COALESCE(pr.id_eletricista, p.id_eletricista) AS id_eletricista,
    COALESCE(pr.matricula, p.matricula) AS matricula,
    COALESCE(pr.nome, p.nome) AS nome_eletricista,
    COALESCE(pr.cpf, p.cpf) AS cpf,
        CASE
            WHEN pr.id IS NOT NULL THEN true
            ELSE false
        END AS tem_eletricista,
    l.erro_detalhe,
        CASE
            WHEN NULLIF(TRIM(BOTH FROM COALESCE(l.erro_detalhe, ''::text)), ''::text) IS NOT NULL THEN true
            ELSE false
        END AS tem_erro,
    e.total_linhas,
    e.total_com_rota,
    e.total_com_eletricista,
    e.total_erros,
    e.mensagem AS mensagem_execucao,
    l.dados,
    NULL::text AS observacao,
    NULL::text AS campo_livre_1,
    NULL::text AS campo_livre_2,
    concat_ws('|'::text, l.run_key, l.recurso, COALESCE(pr.matricula, p.matricula, 'SEM_MATRICULA'::text), COALESCE(pr.cpf, p.cpf, 'SEM_CPF'::text)) AS chave_linha
   FROM dev.toa_leituras_recursos l
     LEFT JOIN dev.toa_execucoes e ON e.id = l.execucao_id
     LEFT JOIN dev.toa_presencas_eletricistas pr ON pr.execucao_id = l.execucao_id AND pr.recurso = l.recurso
     LEFT JOIN dev.toa_pessoas p ON p.id = pr.pessoa_id;

GRANT SELECT ON dev.vw_toa_extracao_completa TO anon, authenticated;

notify pgrst, 'reload schema';
