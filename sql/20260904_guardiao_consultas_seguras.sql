-- Acesso restrito do Guardiao ao texto normalizado das consultas PostgreSQL.
-- Implantado diretamente no Supabase de producao em 04/09/2026.
-- Nao concede acesso a tabelas de negocio nem permite escrita.

begin;

create schema if not exists guardiao_monitoramento;
revoke all on schema guardiao_monitoramento from public;
revoke all on schema guardiao_monitoramento from anon, authenticated;

create or replace function guardiao_monitoramento.top_consultas(
  p_limite integer default 25
)
returns table (
  queryid text,
  usuario text,
  calls bigint,
  total_exec_time double precision,
  mean_exec_time double precision,
  rows bigint,
  shared_blks_read bigint,
  shared_blks_written bigint,
  temp_blks_written bigint,
  wal_bytes numeric,
  query text
)
language sql
security definer
stable
set search_path = pg_catalog, pg_temp
as $function$
  select
    p.queryid::text,
    r.rolname::text as usuario,
    p.calls,
    p.total_exec_time,
    p.mean_exec_time,
    p.rows,
    p.shared_blks_read,
    p.shared_blks_written,
    p.temp_blks_written,
    coalesce(p.wal_bytes, 0)::numeric as wal_bytes,
    left(regexp_replace(p.query, E'\s+', ' ', 'g'), 1200) as query
  from extensions.pg_stat_statements p
  left join pg_catalog.pg_roles r on r.oid = p.userid
  where p.dbid = (
    select d.oid
    from pg_catalog.pg_database d
    where d.datname = pg_catalog.current_database()
  )
    and coalesce(p.query, '') not ilike '%guardiao_monitoramento.top_consultas%'
  order by (p.total_exec_time + p.temp_blks_written * 8.0) desc
  limit least(greatest(coalesce(p_limite, 25), 1), 25)
$function$;

revoke all on function guardiao_monitoramento.top_consultas(integer)
  from public, anon, authenticated;
grant usage on schema guardiao_monitoramento to siga_loader;
grant execute on function guardiao_monitoramento.top_consultas(integer)
  to siga_loader;

commit;

-- Validacao com a credencial do Guardiao:
-- select count(queryid),
--        count(queryid) filter (where query is null or query like '<%privilege%')
-- from guardiao_monitoramento.top_consultas(25);
