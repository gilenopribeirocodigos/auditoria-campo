-- Retencao operacional do historico de GPS.
-- Mantem 90 dias em public.localizacoes e exclui no maximo 5.000 linhas por execucao.
-- Implantado inicialmente em 04/09/2026 no Supabase de producao.
-- O cron usa GMT: 06:20 GMT corresponde a 03:20 no horario local (UTC-3).

-- Em tabelas grandes, criar este indice com CONCURRENTLY em comando isolado:
-- create index concurrently if not exists idx_localizacoes_created_at
--   on public.localizacoes (created_at);
create index if not exists idx_localizacoes_created_at
  on public.localizacoes (created_at);

create or replace function public.limpar_localizacoes_antigas(
  p_limite integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = public
set lock_timeout = '3s'
set statement_timeout = '30s'
as $function$
declare
  v_excluidos integer := 0;
begin
  with candidatas as (
    select id
    from public.localizacoes
    where created_at < now() - interval '90 days'
    order by created_at
    limit least(greatest(coalesce(p_limite, 5000), 1), 5000)
    for update skip locked
  ), excluidas as (
    delete from public.localizacoes l
    using candidatas c
    where l.id = c.id
    returning 1
  )
  select count(*) into v_excluidos from excluidas;

  return v_excluidos;
end;
$function$;

revoke all on function public.limpar_localizacoes_antigas(integer)
  from public, anon, authenticated;

select cron.schedule(
  'retencao-localizacoes-90-dias',
  '20 6 * * *',
  $cron$select public.limpar_localizacoes_antigas(5000);$cron$
);

-- Monitoramento:
-- select * from cron.job where jobname = 'retencao-localizacoes-90-dias';
-- select * from cron.job_run_details where jobid = 2 order by start_time desc limit 20;
