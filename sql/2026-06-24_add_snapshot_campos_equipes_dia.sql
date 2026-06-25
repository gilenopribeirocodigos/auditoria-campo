-- Acrescenta campos de snapshot nos registros de frequencia.
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).
--
-- A tabela equipes_dia acumula registros por data. Estes campos guardam a
-- informacao principal no momento do lancamento, evitando depender sempre
-- de JOIN com a estrutura atual para relatorios historicos.

-- DESENVOLVIMENTO
alter table dev.equipes_dia
  add column if not exists matricula text,
  add column if not exists colaborador text,
  add column if not exists superv_campo text,
  add column if not exists processo_equipe text,
  add column if not exists descricao_motivo_indisponibilidade text;

update dev.equipes_dia ed
set
  matricula = ee.matricula,
  colaborador = ee.colaborador,
  superv_campo = ee.superv_campo,
  processo_equipe = ee.processo_equipe,
  descricao_motivo_indisponibilidade = (
    select mi.descricao
    from dev.motivos_indisponibilidade mi
    where mi.id = ed.id_indisponibilidade
    limit 1
  )
from dev.estrutura_equipes ee
where ee.id = ed.eletricista_id;

create index if not exists idx_equipes_dia_superv_campo_data
  on dev.equipes_dia (superv_campo, data);

create index if not exists idx_equipes_dia_processo_data
  on dev.equipes_dia (processo_equipe, data);

-- Conferencia dev
select
  ed.id,
  ed.data,
  ed.eletricista_id,
  ed.matricula,
  ed.colaborador,
  ed.superv_campo,
  ed.processo_equipe,
  ed.descricao_motivo_indisponibilidade
from dev.equipes_dia ed
order by ed.data desc, ed.id desc
limit 20;

-- PRODUCAO
alter table public.equipes_dia
  add column if not exists matricula text,
  add column if not exists colaborador text,
  add column if not exists superv_campo text,
  add column if not exists processo_equipe text,
  add column if not exists descricao_motivo_indisponibilidade text;

update public.equipes_dia ed
set
  matricula = ee.matricula,
  colaborador = ee.colaborador,
  superv_campo = ee.superv_campo,
  processo_equipe = ee.processo_equipe,
  descricao_motivo_indisponibilidade = (
    select mi.descricao
    from public.motivos_indisponibilidade mi
    where mi.id = ed.id_indisponibilidade
    limit 1
  )
from public.estrutura_equipes ee
where ee.id = ed.eletricista_id;

create index if not exists idx_equipes_dia_superv_campo_data_public
  on public.equipes_dia (superv_campo, data);

create index if not exists idx_equipes_dia_processo_data_public
  on public.equipes_dia (processo_equipe, data);

-- Conferencia producao
select
  ed.id,
  ed.data,
  ed.eletricista_id,
  ed.matricula,
  ed.colaborador,
  ed.superv_campo,
  ed.processo_equipe,
  ed.descricao_motivo_indisponibilidade
from public.equipes_dia ed
order by ed.data desc, ed.id desc
limit 20;
