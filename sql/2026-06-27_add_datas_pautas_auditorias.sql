-- Campos de criacao/execucao das pautas e auditorias.
-- Rodar no Supabase. O script contempla DESENVOLVIMENTO (schema dev)
-- e PRODUCAO (schema public).

alter table if exists dev.pautas
  add column if not exists usuario_criacao text,
  add column if not exists data_geracao date,
  add column if not exists hora_geracao time without time zone,
  add column if not exists data_execucao date,
  add column if not exists hora_execucao time without time zone;

alter table if exists public.pautas
  add column if not exists usuario_criacao text,
  add column if not exists data_geracao date,
  add column if not exists hora_geracao time without time zone,
  add column if not exists data_execucao date,
  add column if not exists hora_execucao time without time zone;

alter table if exists dev.auditorias
  add column if not exists usuario_criacao text,
  add column if not exists data_geracao date,
  add column if not exists hora_geracao time without time zone,
  add column if not exists data_prevista date,
  add column if not exists data_execucao date,
  add column if not exists hora_execucao time without time zone;

alter table if exists public.auditorias
  add column if not exists usuario_criacao text,
  add column if not exists data_geracao date,
  add column if not exists hora_geracao time without time zone,
  add column if not exists data_prevista date,
  add column if not exists data_execucao date,
  add column if not exists hora_execucao time without time zone;

update dev.pautas p
set
  data_geracao = coalesce(p.data_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::date),
  hora_geracao = coalesce(p.hora_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::time),
  data_execucao = coalesce(p.data_execucao, a.data_execucao, a.data_auditoria),
  hora_execucao = coalesce(
    p.hora_execucao,
    a.hora_execucao,
    case
      when a.hora_auditoria::text ~ '^\d{1,2}:\d{2}' then a.hora_auditoria::time
      else null
    end
  )
from dev.auditorias a
where p.auditoria_id::text = a.id::text;

update public.pautas p
set
  data_geracao = coalesce(p.data_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::date),
  hora_geracao = coalesce(p.hora_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::time),
  data_execucao = coalesce(p.data_execucao, a.data_execucao, a.data_auditoria),
  hora_execucao = coalesce(
    p.hora_execucao,
    a.hora_execucao,
    case
      when a.hora_auditoria::text ~ '^\d{1,2}:\d{2}' then a.hora_auditoria::time
      else null
    end
  )
from public.auditorias a
where p.auditoria_id::text = a.id::text;

update dev.auditorias a
set
  usuario_criacao = coalesce(a.usuario_criacao, p.usuario_criacao),
  data_geracao = coalesce(a.data_geracao, p.data_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::date),
  hora_geracao = coalesce(a.hora_geracao, p.hora_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::time),
  data_prevista = coalesce(a.data_prevista, p.data_prevista),
  data_execucao = coalesce(a.data_execucao, a.data_auditoria),
  hora_execucao = coalesce(
    a.hora_execucao,
    case
      when a.hora_auditoria::text ~ '^\d{1,2}:\d{2}' then a.hora_auditoria::time
      else null
    end
  )
from dev.pautas p
where p.auditoria_id::text = a.id::text;

update public.auditorias a
set
  usuario_criacao = coalesce(a.usuario_criacao, p.usuario_criacao),
  data_geracao = coalesce(a.data_geracao, p.data_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::date),
  hora_geracao = coalesce(a.hora_geracao, p.hora_geracao, (p.created_at::timestamptz at time zone 'America/Fortaleza')::time),
  data_prevista = coalesce(a.data_prevista, p.data_prevista),
  data_execucao = coalesce(a.data_execucao, a.data_auditoria),
  hora_execucao = coalesce(
    a.hora_execucao,
    case
      when a.hora_auditoria::text ~ '^\d{1,2}:\d{2}' then a.hora_auditoria::time
      else null
    end
  )
from public.pautas p
where p.auditoria_id::text = a.id::text;
