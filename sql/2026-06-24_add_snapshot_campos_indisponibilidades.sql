-- Acrescenta campos de snapshot nos registros de indisponibilidade de prefixo.
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).
--
-- Estes campos guardam a informacao principal no momento do lancamento,
-- evitando depender sempre de JOIN com a estrutura atual para relatorios historicos.

-- DESENVOLVIMENTO
alter table dev.indisponibilidades
  add column if not exists colaborador text,
  add column if not exists superv_campo text,
  add column if not exists processo_equipe text,
  add column if not exists descricao_motivo_indisponibilidade text;

update dev.indisponibilidades i
set descricao_motivo_indisponibilidade = mi.descricao
from dev.motivos_indisponibilidade mi
where mi.id = i.motivo_id
  and i.descricao_motivo_indisponibilidade is distinct from mi.descricao;

update dev.indisponibilidades i
set
  colaborador = ee.colaborador,
  superv_campo = ee.superv_campo,
  processo_equipe = ee.processo_equipe
from dev.estrutura_equipes ee
where ee.id = i.eletricista_id;

create index if not exists idx_indisponibilidades_superv_campo_data
  on dev.indisponibilidades (superv_campo, data);

create index if not exists idx_indisponibilidades_processo_data
  on dev.indisponibilidades (processo_equipe, data);

create or replace function dev.preencher_snapshot_indisponibilidades()
returns trigger
language plpgsql
as $$
declare
  v_matricula text;
  v_colaborador text;
  v_superv_campo text;
  v_processo_equipe text;
  v_descricao_motivo text;
begin
  select ee.matricula, ee.colaborador, ee.superv_campo, ee.processo_equipe
    into v_matricula, v_colaborador, v_superv_campo, v_processo_equipe
  from dev.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  if found then
    new.matricula := v_matricula;
    new.colaborador := v_colaborador;
    new.superv_campo := v_superv_campo;
    new.processo_equipe := v_processo_equipe;
  end if;

  select mi.descricao
    into v_descricao_motivo
  from dev.motivos_indisponibilidade mi
  where mi.id = new.motivo_id
  limit 1;

  if found then
    new.descricao_motivo_indisponibilidade := v_descricao_motivo;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preencher_snapshot_indisponibilidades on dev.indisponibilidades;
create trigger trg_preencher_snapshot_indisponibilidades
before insert or update of eletricista_id, motivo_id on dev.indisponibilidades
for each row
execute function dev.preencher_snapshot_indisponibilidades();

-- Conferencia dev: deve retornar zero linhas apos a correcao, salvo estrutura/motivo inexistente.
select i.id, i.data, i.eletricista_id, i.colaborador, i.superv_campo, i.processo_equipe, i.descricao_motivo_indisponibilidade
from dev.indisponibilidades i
where i.colaborador is null
   or i.superv_campo is null
   or i.processo_equipe is null
   or i.descricao_motivo_indisponibilidade is null;

-- PRODUCAO
alter table public.indisponibilidades
  add column if not exists colaborador text,
  add column if not exists superv_campo text,
  add column if not exists processo_equipe text,
  add column if not exists descricao_motivo_indisponibilidade text;

update public.indisponibilidades i
set descricao_motivo_indisponibilidade = mi.descricao
from public.motivos_indisponibilidade mi
where mi.id = i.motivo_id
  and i.descricao_motivo_indisponibilidade is distinct from mi.descricao;

update public.indisponibilidades i
set
  colaborador = ee.colaborador,
  superv_campo = ee.superv_campo,
  processo_equipe = ee.processo_equipe
from public.estrutura_equipes ee
where ee.id = i.eletricista_id;

create index if not exists idx_indisponibilidades_superv_campo_data_public
  on public.indisponibilidades (superv_campo, data);

create index if not exists idx_indisponibilidades_processo_data_public
  on public.indisponibilidades (processo_equipe, data);

create or replace function public.preencher_snapshot_indisponibilidades()
returns trigger
language plpgsql
as $$
declare
  v_matricula text;
  v_colaborador text;
  v_superv_campo text;
  v_processo_equipe text;
  v_descricao_motivo text;
begin
  select ee.matricula, ee.colaborador, ee.superv_campo, ee.processo_equipe
    into v_matricula, v_colaborador, v_superv_campo, v_processo_equipe
  from public.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  if found then
    new.matricula := v_matricula;
    new.colaborador := v_colaborador;
    new.superv_campo := v_superv_campo;
    new.processo_equipe := v_processo_equipe;
  end if;

  select mi.descricao
    into v_descricao_motivo
  from public.motivos_indisponibilidade mi
  where mi.id = new.motivo_id
  limit 1;

  if found then
    new.descricao_motivo_indisponibilidade := v_descricao_motivo;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_preencher_snapshot_indisponibilidades on public.indisponibilidades;
create trigger trg_preencher_snapshot_indisponibilidades
before insert or update of eletricista_id, motivo_id on public.indisponibilidades
for each row
execute function public.preencher_snapshot_indisponibilidades();

-- Conferencia producao: deve retornar zero linhas apos a correcao, salvo estrutura/motivo inexistente.
select i.id, i.data, i.eletricista_id, i.colaborador, i.superv_campo, i.processo_equipe, i.descricao_motivo_indisponibilidade
from public.indisponibilidades i
where i.colaborador is null
   or i.superv_campo is null
   or i.processo_equipe is null
   or i.descricao_motivo_indisponibilidade is null;
