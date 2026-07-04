-- Campos de metragem de cabos em pautas e auditorias.
-- Rodar em desenvolvimento (schema dev) e producao (schema public).

alter table if exists dev.pautas
  add column if not exists qtde_cabos_os numeric(12,2),
  add column if not exists qtde_cabos_em_campo numeric(12,2);

alter table if exists public.pautas
  add column if not exists qtde_cabos_os numeric(12,2),
  add column if not exists qtde_cabos_em_campo numeric(12,2);

alter table if exists dev.auditorias
  add column if not exists qtde_cabos_os numeric(12,2),
  add column if not exists qtde_cabos_em_campo numeric(12,2);

alter table if exists public.auditorias
  add column if not exists qtde_cabos_os numeric(12,2),
  add column if not exists qtde_cabos_em_campo numeric(12,2);

update dev.auditorias a
set qtde_cabos_os = p.qtde_cabos_os
from dev.pautas p
where p.auditoria_id::text = a.id::text
  and a.qtde_cabos_os is null
  and p.qtde_cabos_os is not null;

update public.auditorias a
set qtde_cabos_os = p.qtde_cabos_os
from public.pautas p
where p.auditoria_id::text = a.id::text
  and a.qtde_cabos_os is null
  and p.qtde_cabos_os is not null;

update dev.pautas p
set qtde_cabos_em_campo = a.qtde_cabos_em_campo
from dev.auditorias a
where p.auditoria_id::text = a.id::text
  and p.qtde_cabos_em_campo is null
  and a.qtde_cabos_em_campo is not null;

update public.pautas p
set qtde_cabos_em_campo = a.qtde_cabos_em_campo
from public.auditorias a
where p.auditoria_id::text = a.id::text
  and p.qtde_cabos_em_campo is null
  and a.qtde_cabos_em_campo is not null;
