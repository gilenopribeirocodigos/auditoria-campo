begin;

-- Padroniza a tabela de motivos nos ambientes de desenvolvimento e producao.
-- O remapeamento preserva o significado dos registros ja gravados nas tabelas filhas.

-- DEV
create temp table _mig_motivos_dev_needs_remap as
select exists (
  select 1
  from dev.motivos_indisponibilidade
  where id = 1
    and upper(descricao) = 'PRESENTE'
) as needs_remap;

update dev.motivos_indisponibilidade
set descricao = '__OLD__' || id::text || '__' || descricao;

with motivos(id, descricao, ativo) as (
  values
    (1,  'ATESTADO MEDICO', true),
    (2,  'FALTA INJUSTIFICADA', true),
    (3,  'VIATURA COM DEFEITO', true),
    (4,  'VIATURA EM MANUTENCAO', true),
    (5,  'ACIDENTE', true),
    (6,  'TREINAMENTO', true),
    (7,  'FERIAS', true),
    (8,  'LICENCA', true),
    (9,  'OUTRO', true),
    (10, 'FOLGA P/FOLGA TRABALHADA', true),
    (11, 'INTERJORNADA', true),
    (12, 'AUDIENCIA JUDICIAL', true),
    (13, 'MEDIDA DISCIPLINAR', true),
    (14, 'SEM EPI/EPC', true),
    (15, 'PRESENTE', true),
    (16, 'EXAME PERIODICO', true),
    (17, 'AF.PREVIDENCIA', true),
    (18, 'FALTA ACORDADA/COMPENSAR', true),
    (19, 'DESLIGADO', true),
    (20, 'REMANEJAMENTO EMPREGADO DE BASE', true)
)
insert into dev.motivos_indisponibilidade (id, descricao, ativo)
select id, descricao, ativo
from motivos
on conflict (id) do update
set descricao = excluded.descricao,
    ativo = excluded.ativo;

with mapa(old_id, new_id) as (
  values
    (1, 15),
    (2, 1),
    (3, 2),
    (4, 3),
    (5, 4),
    (6, 5),
    (7, 6),
    (8, 7),
    (9, 8),
    (10, 17),
    (11, 13),
    (12, 9)
)
update dev.equipes_dia ed
set id_indisponibilidade = mapa.new_id
from mapa
where ed.id_indisponibilidade = mapa.old_id
  and (select needs_remap from _mig_motivos_dev_needs_remap);

with mapa(old_id, new_id) as (
  values
    (1, 15),
    (2, 1),
    (3, 2),
    (4, 3),
    (5, 4),
    (6, 5),
    (7, 6),
    (8, 7),
    (9, 8),
    (10, 17),
    (11, 13),
    (12, 9)
)
update dev.indisponibilidades i
set motivo_id = mapa.new_id
from mapa
where i.motivo_id = mapa.old_id
  and (select needs_remap from _mig_motivos_dev_needs_remap);

update dev.equipes_dia ed
set descricao_motivo_indisponibilidade = mi.descricao
from dev.motivos_indisponibilidade mi
where mi.id = ed.id_indisponibilidade;

update dev.indisponibilidades i
set descricao_motivo_indisponibilidade = mi.descricao
from dev.motivos_indisponibilidade mi
where mi.id = i.motivo_id;

delete from dev.motivos_indisponibilidade
where id not between 1 and 20;

do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('dev.motivos_indisponibilidade', 'id');
  if seq_name is not null then
    perform setval(seq_name, (select max(id) from dev.motivos_indisponibilidade), true);
  end if;
end $$;

drop table _mig_motivos_dev_needs_remap;

-- PRODUCAO
create temp table _mig_motivos_public_needs_remap as
select exists (
  select 1
  from public.motivos_indisponibilidade
  where id = 1
    and upper(descricao) = 'PRESENTE'
) as needs_remap;

update public.motivos_indisponibilidade
set descricao = '__OLD__' || id::text || '__' || descricao;

with motivos(id, descricao, ativo) as (
  values
    (1,  'ATESTADO MEDICO', true),
    (2,  'FALTA INJUSTIFICADA', true),
    (3,  'VIATURA COM DEFEITO', true),
    (4,  'VIATURA EM MANUTENCAO', true),
    (5,  'ACIDENTE', true),
    (6,  'TREINAMENTO', true),
    (7,  'FERIAS', true),
    (8,  'LICENCA', true),
    (9,  'OUTRO', true),
    (10, 'FOLGA P/FOLGA TRABALHADA', true),
    (11, 'INTERJORNADA', true),
    (12, 'AUDIENCIA JUDICIAL', true),
    (13, 'MEDIDA DISCIPLINAR', true),
    (14, 'SEM EPI/EPC', true),
    (15, 'PRESENTE', true),
    (16, 'EXAME PERIODICO', true),
    (17, 'AF.PREVIDENCIA', true),
    (18, 'FALTA ACORDADA/COMPENSAR', true),
    (19, 'DESLIGADO', true),
    (20, 'REMANEJAMENTO EMPREGADO DE BASE', true)
)
insert into public.motivos_indisponibilidade (id, descricao, ativo)
select id, descricao, ativo
from motivos
on conflict (id) do update
set descricao = excluded.descricao,
    ativo = excluded.ativo;

with mapa(old_id, new_id) as (
  values
    (1, 15),
    (2, 1),
    (3, 2),
    (4, 3),
    (5, 4),
    (6, 5),
    (7, 6),
    (8, 7),
    (9, 8),
    (10, 17),
    (11, 13),
    (12, 9)
)
update public.equipes_dia ed
set id_indisponibilidade = mapa.new_id
from mapa
where ed.id_indisponibilidade = mapa.old_id
  and (select needs_remap from _mig_motivos_public_needs_remap);

with mapa(old_id, new_id) as (
  values
    (1, 15),
    (2, 1),
    (3, 2),
    (4, 3),
    (5, 4),
    (6, 5),
    (7, 6),
    (8, 7),
    (9, 8),
    (10, 17),
    (11, 13),
    (12, 9)
)
update public.indisponibilidades i
set motivo_id = mapa.new_id
from mapa
where i.motivo_id = mapa.old_id
  and (select needs_remap from _mig_motivos_public_needs_remap);

update public.equipes_dia ed
set descricao_motivo_indisponibilidade = mi.descricao
from public.motivos_indisponibilidade mi
where mi.id = ed.id_indisponibilidade;

update public.indisponibilidades i
set descricao_motivo_indisponibilidade = mi.descricao
from public.motivos_indisponibilidade mi
where mi.id = i.motivo_id;

delete from public.motivos_indisponibilidade
where id not between 1 and 20;

do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('public.motivos_indisponibilidade', 'id');
  if seq_name is not null then
    perform setval(seq_name, (select max(id) from public.motivos_indisponibilidade), true);
  end if;
end $$;

drop table _mig_motivos_public_needs_remap;

commit;
