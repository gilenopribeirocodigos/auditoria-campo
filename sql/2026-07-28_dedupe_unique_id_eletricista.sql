-- Corrige a causa raiz de duplicidade de registros de Frequencia/Indisponibilidade
-- no mesmo dia: o upsert do app usava onConflict "eletricista_id,data", mas
-- eletricista_id (numerico) e recriado do zero a cada reimportacao da Estrutura
-- Online. Isso fazia o upsert falhar em reconhecer um registro ja existente
-- (feito antes da reimportacao) e inserir um registro NOVO em vez de atualizar,
-- gerando 2-3 linhas pro mesmo eletricista no mesmo dia sempre que a Estrutura
-- Online era recarregada mais de uma vez no dia.
--
-- Passo 1: remove as duplicatas ja existentes, mantendo so a mais recente
-- (maior criado_em/id) por eletricista (id_eletricista, uuid permanente) + data.
-- Passo 2: cria constraint unica em (id_eletricista, data), que o app agora usa
-- como alvo do onConflict (com fallback pro id numerico se a constraint nao
-- existir ainda, pra nao quebrar antes desta migracao rodar).
--
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

-- Conferencia ANTES: quantas duplicatas existem hoje.
select 'dev.equipes_dia' as tabela, id_eletricista, data, count(*)
from dev.equipes_dia
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

select 'dev.indisponibilidades' as tabela, id_eletricista, data, count(*)
from dev.indisponibilidades
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

delete from dev.equipes_dia t
using dev.equipes_dia t2
where t.id_eletricista is not null
  and t.id_eletricista = t2.id_eletricista
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

delete from dev.indisponibilidades t
using dev.indisponibilidades t2
where t.id_eletricista is not null
  and t.id_eletricista = t2.id_eletricista
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

create unique index if not exists ux_equipes_dia_id_eletricista_data
  on dev.equipes_dia (id_eletricista, data);

create unique index if not exists ux_indisponibilidades_id_eletricista_data
  on dev.indisponibilidades (id_eletricista, data);

-- Conferencia DEPOIS: deve retornar zero linhas.
select 'dev.equipes_dia' as tabela, id_eletricista, data, count(*)
from dev.equipes_dia
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

select 'dev.indisponibilidades' as tabela, id_eletricista, data, count(*)
from dev.indisponibilidades
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

select 'public.equipes_dia' as tabela, id_eletricista, data, count(*)
from public.equipes_dia
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

select 'public.indisponibilidades' as tabela, id_eletricista, data, count(*)
from public.indisponibilidades
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

delete from public.equipes_dia t
using public.equipes_dia t2
where t.id_eletricista is not null
  and t.id_eletricista = t2.id_eletricista
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

delete from public.indisponibilidades t
using public.indisponibilidades t2
where t.id_eletricista is not null
  and t.id_eletricista = t2.id_eletricista
  and t.data = t2.data
  and (t.criado_em, t.id) < (t2.criado_em, t2.id);

create unique index if not exists ux_equipes_dia_id_eletricista_data_public
  on public.equipes_dia (id_eletricista, data);

create unique index if not exists ux_indisponibilidades_id_eletricista_data_public
  on public.indisponibilidades (id_eletricista, data);

select 'public.equipes_dia' as tabela, id_eletricista, data, count(*)
from public.equipes_dia
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

select 'public.indisponibilidades' as tabela, id_eletricista, data, count(*)
from public.indisponibilidades
where id_eletricista is not null
group by id_eletricista, data
having count(*) > 1;

notify pgrst, 'reload schema';
