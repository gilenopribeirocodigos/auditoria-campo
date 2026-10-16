-- Cancela as 2 pautas pendentes travadas (vencidas desde agosto, nunca
-- concluidas) que ficaram reaparecendo todo dia na lista do fiscal pros
-- prefixos PI-THE-C004M e PI-THE-C005M. A recorrencia dessas 2 cadeias ja
-- foi desativada (sql/2026-10-07_desativar_recorrencias_sem_prazo.sql) —
-- isso aqui so fecha as 2 pautas que ja existiam, geradas antes da
-- desativacao. Nao afeta nenhuma outra pauta nem reabre a recorrencia.
--
-- public.pautas (nao tem espelho em dev para esses dados reais).

-- 1) Conferir ANTES:
select id, prefixo, fiscal_login, data_prevista, status, recorrencia_ativa
from public.pautas
where id in (536, 537);

-- 2) Cancelar:
update public.pautas
set status = 'CANCELADA'
where id in (536, 537);

-- 3) Conferir DEPOIS — status deve estar CANCELADA nas duas:
select id, prefixo, fiscal_login, data_prevista, status, recorrencia_ativa
from public.pautas
where id in (536, 537);
