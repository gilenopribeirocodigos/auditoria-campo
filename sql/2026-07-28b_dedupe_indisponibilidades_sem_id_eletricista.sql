-- Limpeza complementar: as duplicatas de indisponibilidades criadas ANTES do
-- app passar a gravar id_eletricista no carimbo (v3.16.2, 27/07) ficaram com
-- id_eletricista NULL — por isso o dedupe de 2026-07-28_dedupe_unique_id_eletricista.sql
-- (que so age onde id_eletricista is not null) nao removeu essas linhas.
--
-- Aqui a duplicidade e identificada por matricula+data (o dado permanente do
-- eletricista, igual ao id_eletricista mas ja preenchido em 100% das linhas
-- antigas). Mantem so o carimbo mais recente (maior criado_em/id) de cada
-- matricula+data e, no que sobrar, preenche o id_eletricista a partir do
-- cadastro mestre (eletricistas_cadastro), pra nao repetir esse problema com
-- essas linhas especificas dai em diante.
--
-- ATENCAO: em pelo menos 2 casos (conferir consulta "ANTES" abaixo) as duas
-- linhas duplicadas tinham prefixo/motivo DIFERENTES entre si — pode ser so
-- reflexo do prefixo ter mudado entre uma reimportacao e outra (mesmo evento),
-- ou pode ser um segundo evento real (a pessoa foi remanejada de novo e ficou
-- indisponivel de novo, num prefixo diferente, no mesmo dia). Este script
-- assume "mais recente vence" (mesma regra ja usada no dedupe anterior) —
-- revisar o resultado dessas linhas especificas depois de rodar.
--
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

-- Conferencia ANTES.
select matricula, data, count(*), array_agg(id order by criado_em) as ids,
       array_agg(prefixo order by criado_em) as prefixos,
       array_agg(descricao_motivo_indisponibilidade order by criado_em) as motivos
from dev.indisponibilidades
where id_eletricista is null
group by matricula, data
having count(*) > 1;

delete from dev.indisponibilidades t
using dev.indisponibilidades t2
where t.id_eletricista is null
  and t2.id_eletricista is null
  and t.matricula is not null
  and t.matricula = t2.matricula
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

update dev.indisponibilidades i
set id_eletricista = ec.id_eletricista
from dev.eletricistas_cadastro ec
where i.id_eletricista is null
  and ec.matricula = i.matricula;

-- Conferencia DEPOIS: deve retornar zero linhas.
select matricula, data, count(*)
from dev.indisponibilidades
where id_eletricista is null
group by matricula, data
having count(*) > 1;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

select matricula, data, count(*), array_agg(id order by criado_em) as ids,
       array_agg(prefixo order by criado_em) as prefixos,
       array_agg(descricao_motivo_indisponibilidade order by criado_em) as motivos
from public.indisponibilidades
where id_eletricista is null
group by matricula, data
having count(*) > 1;

delete from public.indisponibilidades t
using public.indisponibilidades t2
where t.id_eletricista is null
  and t2.id_eletricista is null
  and t.matricula is not null
  and t.matricula = t2.matricula
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

update public.indisponibilidades i
set id_eletricista = ec.id_eletricista
from public.eletricistas_cadastro ec
where i.id_eletricista is null
  and ec.matricula = i.matricula;

select matricula, data, count(*)
from public.indisponibilidades
where id_eletricista is null
group by matricula, data
having count(*) > 1;

notify pgrst, 'reload schema';
