-- Campos do bloco "Motivo da Auditoria" em auditorias e pautas.
-- Rodar inteiro: cobre DESENVOLVIMENTO (schema dev) e PRODUCAO (schema public).

-- DESENVOLVIMENTO
alter table dev.auditorias
  add column if not exists motivo_auditoria text,
  add column if not exists status_motivo_auditoria boolean,
  add column if not exists avaliacao_motivo_auditoria text,
  add column if not exists observacoes_motivo_auditoria text,
  add column if not exists fotos_motivo_urls text[];

alter table dev.pautas
  add column if not exists avaliacao_motivo_auditoria text;

update dev.pautas p
set avaliacao_motivo_auditoria = a.avaliacao_motivo_auditoria
from dev.auditorias a
where p.auditoria_id = a.id
  and p.avaliacao_motivo_auditoria is null
  and a.avaliacao_motivo_auditoria is not null;

update dev.auditorias a
set motivo_auditoria = p.motivo_auditoria
from dev.pautas p
where p.auditoria_id = a.id
  and a.motivo_auditoria is null
  and p.motivo_auditoria is not null;

-- PRODUCAO
alter table public.auditorias
  add column if not exists motivo_auditoria text,
  add column if not exists status_motivo_auditoria boolean,
  add column if not exists avaliacao_motivo_auditoria text,
  add column if not exists observacoes_motivo_auditoria text,
  add column if not exists fotos_motivo_urls text[];

alter table public.pautas
  add column if not exists avaliacao_motivo_auditoria text;

update public.pautas p
set avaliacao_motivo_auditoria = a.avaliacao_motivo_auditoria
from public.auditorias a
where p.auditoria_id = a.id
  and p.avaliacao_motivo_auditoria is null
  and a.avaliacao_motivo_auditoria is not null;

update public.auditorias a
set motivo_auditoria = p.motivo_auditoria
from public.pautas p
where p.auditoria_id = a.id
  and a.motivo_auditoria is null
  and p.motivo_auditoria is not null;
