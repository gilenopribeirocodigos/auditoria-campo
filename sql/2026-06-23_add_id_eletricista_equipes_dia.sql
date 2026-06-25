-- Acrescenta o ID permanente do eletricista nos registros de frequência.
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO
alter table dev.equipes_dia
  add column if not exists id_eletricista uuid;

update dev.equipes_dia ed
set id_eletricista = ee.id_eletricista
from dev.estrutura_equipes ee
where ed.id_eletricista is null
  and ee.id = ed.eletricista_id;

create index if not exists idx_equipes_dia_id_eletricista
  on dev.equipes_dia (id_eletricista);

-- Conferencia dev: deve retornar apenas registros antigos que nao conseguiram casar pela estrutura atual.
select ed.id, ed.data, ed.eletricista_id, ed.prefixo
from dev.equipes_dia ed
where ed.id_eletricista is null;

-- PRODUCAO
alter table public.equipes_dia
  add column if not exists id_eletricista uuid;

update public.equipes_dia ed
set id_eletricista = ee.id_eletricista
from public.estrutura_equipes ee
where ed.id_eletricista is null
  and ee.id = ed.eletricista_id;

create index if not exists idx_equipes_dia_id_eletricista_public
  on public.equipes_dia (id_eletricista);

-- Conferencia producao: deve retornar apenas registros antigos que nao conseguiram casar pela estrutura atual.
select ed.id, ed.data, ed.eletricista_id, ed.prefixo
from public.equipes_dia ed
where ed.id_eletricista is null;
