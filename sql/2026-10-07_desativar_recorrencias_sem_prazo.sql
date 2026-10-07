-- Desativa recorrências de Pauta de Fiscalização sem condição de parada
-- (recorrencia_max_execucoes e recorrencia_fim_data nulos) que ficaram
-- "ativa" indefinidamente — mesmo efeito do botão "🛑 Parar Recorrência" da
-- tela, só que pras 8 cadeias já identificadas de uma vez. NÃO apaga nem
-- cancela nenhuma pauta já criada (pendente ou concluída) — só impede que
-- essas cadeias gerem a PRÓXIMA pauta automaticamente.
--
-- public.pautas (não tem espelho em dev para esses dados reais).

-- 1) Conferir ANTES — as 8 cadeias que serão desativadas:
select id, prefixo, fiscal_login, recorrencia, recorrencia_ativa,
       recorrencia_max_execucoes, recorrencia_fim_data, recorrencia_execucoes_geradas
from public.pautas
where id in (398, 403, 399, 402, 400, 290, 253, 401);

-- 2) Desativar:
update public.pautas
set recorrencia_ativa = false
where id in (398, 403, 399, 402, 400, 290, 253, 401);

-- 3) Conferir DEPOIS — recorrencia_ativa deve estar false em todas:
select id, prefixo, fiscal_login, recorrencia, recorrencia_ativa
from public.pautas
where id in (398, 403, 399, 402, 400, 290, 253, 401);
