-- Acrescenta o ID permanente do eletricista (uuid, estavel entre reimportacoes
-- da Estrutura Online) nos registros de indisponibilidade de prefixo.
-- Mesmo padrao ja aplicado em equipes_dia (2026-06-23_add_id_eletricista_equipes_dia.sql).
--
-- Motivo: toda reimportacao da Estrutura Online apaga e recria estrutura_equipes,
-- gerando novos "id" numericos (auto-incremento) para todo mundo. Como
-- indisponibilidades.eletricista_id guarda esse id numerico (nao o uuid
-- permanente id_eletricista), uma reimportacao no meio do dia "orfaniza" os
-- registros de indisponibilidade feitos antes dela: o id antigo nao bate mais
-- com nenhuma linha atual de estrutura_equipes. Isso fez o mesmo eletricista
-- ser carimbado duas vezes no mesmo dia (uma com o id antigo, outra com o novo),
-- porque o filtro que evita duplicidade (idsComIndisp) so comparava pelo id
-- numerico mutavel.
-- Rodar primeiro no DESENVOLVIMENTO (schema dev) e depois na PRODUCAO (schema public).

-- DESENVOLVIMENTO
alter table dev.indisponibilidades
  add column if not exists id_eletricista uuid;

update dev.indisponibilidades i
set id_eletricista = ee.id_eletricista
from dev.estrutura_equipes ee
where i.id_eletricista is null
  and ee.id = i.eletricista_id;

create index if not exists idx_indisponibilidades_id_eletricista
  on dev.indisponibilidades (id_eletricista);

create or replace function dev.preencher_snapshot_indisponibilidades()
returns trigger
language plpgsql
as $$
declare
  v_id_eletricista uuid;
  v_matricula text;
  v_colaborador text;
  v_superv_campo text;
  v_processo_equipe text;
  v_descricao_motivo text;
begin
  select ee.id_eletricista, ee.matricula, ee.colaborador, ee.superv_campo, ee.processo_equipe
    into v_id_eletricista, v_matricula, v_colaborador, v_superv_campo, v_processo_equipe
  from dev.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  if found then
    new.id_eletricista := coalesce(new.id_eletricista, v_id_eletricista);
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

-- Conferencia dev: registros orfaos (id numerico nao bate mais com a estrutura atual).
select i.id, i.data, i.eletricista_id, i.colaborador
from dev.indisponibilidades i
where i.id_eletricista is null;

-- PRODUCAO
alter table public.indisponibilidades
  add column if not exists id_eletricista uuid;

update public.indisponibilidades i
set id_eletricista = ee.id_eletricista
from public.estrutura_equipes ee
where i.id_eletricista is null
  and ee.id = i.eletricista_id;

create index if not exists idx_indisponibilidades_id_eletricista_public
  on public.indisponibilidades (id_eletricista);

create or replace function public.preencher_snapshot_indisponibilidades()
returns trigger
language plpgsql
as $$
declare
  v_id_eletricista uuid;
  v_matricula text;
  v_colaborador text;
  v_superv_campo text;
  v_processo_equipe text;
  v_descricao_motivo text;
begin
  select ee.id_eletricista, ee.matricula, ee.colaborador, ee.superv_campo, ee.processo_equipe
    into v_id_eletricista, v_matricula, v_colaborador, v_superv_campo, v_processo_equipe
  from public.estrutura_equipes ee
  where ee.id = new.eletricista_id
  limit 1;

  if found then
    new.id_eletricista := coalesce(new.id_eletricista, v_id_eletricista);
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

-- Conferencia producao: registros orfaos (id numerico nao bate mais com a estrutura atual).
select i.id, i.data, i.eletricista_id, i.colaborador
from public.indisponibilidades i
where i.id_eletricista is null;
