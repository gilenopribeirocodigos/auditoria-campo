-- Numero unico da Auditoria de Servico (AS) para vincular pauta, auditoria, OS e UC.
-- Rode nos ambientes desenvolvimento (dev) e producao (public).

alter table if exists dev.pautas
  add column if not exists numero_as text;

alter table if exists dev.auditorias
  add column if not exists numero_as text;

alter table if exists public.pautas
  add column if not exists numero_as text;

alter table if exists public.auditorias
  add column if not exists numero_as text;

create unique index if not exists dev_pautas_numero_as_uidx
  on dev.pautas (numero_as)
  where numero_as is not null;

create unique index if not exists dev_auditorias_numero_as_uidx
  on dev.auditorias (numero_as)
  where numero_as is not null;

create unique index if not exists public_pautas_numero_as_uidx
  on public.pautas (numero_as)
  where numero_as is not null;

create unique index if not exists public_auditorias_numero_as_uidx
  on public.auditorias (numero_as)
  where numero_as is not null;
