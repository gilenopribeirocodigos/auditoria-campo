-- Corrige e garante o preenchimento da descricao do motivo em equipes_dia.
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO
update dev.equipes_dia ed
set descricao_motivo_indisponibilidade = mi.descricao
from dev.motivos_indisponibilidade mi
where mi.id = ed.id_indisponibilidade
  and ed.descricao_motivo_indisponibilidade is distinct from mi.descricao;

create or replace function dev.preencher_snapshot_equipes_dia()
returns trigger
language plpgsql
as $$
begin
  select mi.descricao
    into new.descricao_motivo_indisponibilidade
  from dev.motivos_indisponibilidade mi
  where mi.id = new.id_indisponibilidade
  limit 1;

  select
    coalesce(new.id_eletricista, ee.id_eletricista),
    coalesce(new.matricula, ee.matricula),
    coalesce(new.colaborador, ee.colaborador),
    coalesce(new.superv_campo, ee.superv_campo),
    coalesce(new.processo_equipe, ee.processo_equipe)
  into
    new.id_eletricista,
    new.matricula,
    new.colaborador,
    new.superv_campo,
    new.processo_equipe
  from dev.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  return new;
end;
$$;

drop trigger if exists trg_preencher_snapshot_equipes_dia on dev.equipes_dia;
create trigger trg_preencher_snapshot_equipes_dia
before insert or update of eletricista_id, id_indisponibilidade on dev.equipes_dia
for each row
execute function dev.preencher_snapshot_equipes_dia();

-- Conferencia dev: deve retornar zero linhas apos a correcao, salvo motivo inexistente.
select ed.id, ed.data, ed.eletricista_id, ed.id_indisponibilidade, ed.descricao_motivo_indisponibilidade
from dev.equipes_dia ed
where ed.id_indisponibilidade is not null
  and ed.descricao_motivo_indisponibilidade is null;

-- PRODUCAO
update public.equipes_dia ed
set descricao_motivo_indisponibilidade = mi.descricao
from public.motivos_indisponibilidade mi
where mi.id = ed.id_indisponibilidade
  and ed.descricao_motivo_indisponibilidade is distinct from mi.descricao;

create or replace function public.preencher_snapshot_equipes_dia()
returns trigger
language plpgsql
as $$
begin
  select mi.descricao
    into new.descricao_motivo_indisponibilidade
  from public.motivos_indisponibilidade mi
  where mi.id = new.id_indisponibilidade
  limit 1;

  select
    coalesce(new.id_eletricista, ee.id_eletricista),
    coalesce(new.matricula, ee.matricula),
    coalesce(new.colaborador, ee.colaborador),
    coalesce(new.superv_campo, ee.superv_campo),
    coalesce(new.processo_equipe, ee.processo_equipe)
  into
    new.id_eletricista,
    new.matricula,
    new.colaborador,
    new.superv_campo,
    new.processo_equipe
  from public.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  return new;
end;
$$;

drop trigger if exists trg_preencher_snapshot_equipes_dia on public.equipes_dia;
create trigger trg_preencher_snapshot_equipes_dia
before insert or update of eletricista_id, id_indisponibilidade on public.equipes_dia
for each row
execute function public.preencher_snapshot_equipes_dia();

-- Conferencia producao: deve retornar zero linhas apos a correcao, salvo motivo inexistente.
select ed.id, ed.data, ed.eletricista_id, ed.id_indisponibilidade, ed.descricao_motivo_indisponibilidade
from public.equipes_dia ed
where ed.id_indisponibilidade is not null
  and ed.descricao_motivo_indisponibilidade is null;
