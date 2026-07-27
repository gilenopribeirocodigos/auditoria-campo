-- Copia dados de produção (public.toa_*) pra dev.toa_* — SÓ LEITURA em
-- public, nada é alterado lá. O robô continua alimentando só o public
-- normalmente; isso aqui é uma cópia pontual pra ter dado de verdade em dev
-- e testar o sistema antes de promover os ajustes pra produção.
--
-- "Hoje" é calculado no fuso America/Fortaleza (mesmo padrão usado na view
-- vw_toa_extracao_completa), então funciona no dia em que for rodado — não
-- precisa editar data nenhuma.
--
-- Idempotente (ON CONFLICT DO NOTHING): pode rodar de novo no mesmo dia sem
-- duplicar. Se quiser recomeçar do zero em dev antes de rodar, teria que
-- limpar as tabelas de teste primeiro (TRUNCATE) — não incluído aqui de
-- propósito, por ser destrutivo; só faça isso com certeza do que está
-- fazendo, e nunca em public.

-- 1) Pessoas: tabela de referência (nome/matrícula/cpf), não é "por dia" —
--    copia tudo, pra qualquer join de hoje (ou de outro teste futuro) achar
--    o eletricista certo.
INSERT INTO dev.toa_pessoas (id, matricula, cpf, nome, primeiro_visto_em, ultimo_visto_em, id_eletricista, criado_em, atualizado_em)
SELECT id, matricula, cpf, nome, primeiro_visto_em, ultimo_visto_em, id_eletricista, criado_em, atualizado_em
FROM public.toa_pessoas
ON CONFLICT (id) DO NOTHING;

SELECT setval('dev.toa_pessoas_id_seq', COALESCE((SELECT MAX(id) FROM dev.toa_pessoas), 0));

-- 2) Execuções de hoje
INSERT INTO dev.toa_execucoes (id, run_key, bloco, inicio_em, fim_em, status, arquivo_xlsx, total_linhas, total_com_rota, total_com_eletricista, total_erros, mensagem)
SELECT id, run_key, bloco, inicio_em, fim_em, status, arquivo_xlsx, total_linhas, total_com_rota, total_com_eletricista, total_erros, mensagem
FROM public.toa_execucoes
WHERE (inicio_em AT TIME ZONE 'America/Fortaleza')::date = (now() AT TIME ZONE 'America/Fortaleza')::date
ON CONFLICT (id) DO NOTHING;

SELECT setval('dev.toa_execucoes_id_seq', COALESCE((SELECT MAX(id) FROM dev.toa_execucoes), 0));

-- 3) Leituras de recursos das execuções de hoje (mantém consistência com o item 2)
INSERT INTO dev.toa_leituras_recursos (id, execucao_id, run_key, bloco, localidade, recurso, login, logoff, inicio_almoco, fim_almoco, login_grade, logoff_grade, rota_detalhe, status_rota, placa_viatura, recurso_online, erro_detalhe, dados, coletado_em, data_extracao, hora_extracao)
SELECT id, execucao_id, run_key, bloco, localidade, recurso, login, logoff, inicio_almoco, fim_almoco, login_grade, logoff_grade, rota_detalhe, status_rota, placa_viatura, recurso_online, erro_detalhe, dados, coletado_em, data_extracao, hora_extracao
FROM public.toa_leituras_recursos
WHERE execucao_id IN (
  SELECT id FROM public.toa_execucoes
  WHERE (inicio_em AT TIME ZONE 'America/Fortaleza')::date = (now() AT TIME ZONE 'America/Fortaleza')::date
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('dev.toa_leituras_recursos_id_seq', COALESCE((SELECT MAX(id) FROM dev.toa_leituras_recursos), 0));

-- 4) Presenças de eletricistas das execuções de hoje
INSERT INTO dev.toa_presencas_eletricistas (id, execucao_id, run_key, localidade, recurso, pessoa_id, matricula, nome, cpf, login, logoff, inicio_almoco, fim_almoco, placa_viatura, observado_em, data_extracao, hora_extracao, id_eletricista)
SELECT id, execucao_id, run_key, localidade, recurso, pessoa_id, matricula, nome, cpf, login, logoff, inicio_almoco, fim_almoco, placa_viatura, observado_em, data_extracao, hora_extracao, id_eletricista
FROM public.toa_presencas_eletricistas
WHERE execucao_id IN (
  SELECT id FROM public.toa_execucoes
  WHERE (inicio_em AT TIME ZONE 'America/Fortaleza')::date = (now() AT TIME ZONE 'America/Fortaleza')::date
)
ON CONFLICT (id) DO NOTHING;

SELECT setval('dev.toa_presencas_eletricistas_id_seq', COALESCE((SELECT MAX(id) FROM dev.toa_presencas_eletricistas), 0));

-- 5) Alocações de eletricistas de hoje (data_base = hoje)
INSERT INTO dev.toa_alocacoes_eletricistas (id, data_base, localidade, recurso, pessoa_id, primeiro_visto_em, ultimo_visto_em, qtd_confirmacoes, id_eletricista)
SELECT id, data_base, localidade, recurso, pessoa_id, primeiro_visto_em, ultimo_visto_em, qtd_confirmacoes, id_eletricista
FROM public.toa_alocacoes_eletricistas
WHERE data_base = (now() AT TIME ZONE 'America/Fortaleza')::date
ON CONFLICT (id) DO NOTHING;

SELECT setval('dev.toa_alocacoes_eletricistas_id_seq', COALESCE((SELECT MAX(id) FROM dev.toa_alocacoes_eletricistas), 0));
