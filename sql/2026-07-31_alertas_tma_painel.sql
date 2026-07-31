begin;

update public.stc_alertas
set url_tratamento =
    'https://auditoria-campo.onrender.com/alertas/'
    || token_tratamento::text
where url_tratamento is distinct from (
    'https://auditoria-campo.onrender.com/alertas/'
    || token_tratamento::text
);

create or replace function public.stc_painel_alertas_tma(
    p_status text default null,
    p_busca text default null,
    p_fiscal text default null,
    p_data_inicio date default null,
    p_data_fim date default null,
    p_limite integer default 500,
    p_offset integer default 0
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with base_periodo as (
    select a.*
    from public.stc_alertas a
    where
        (
            p_data_inicio is null
            or a.criado_em >= (
                p_data_inicio::timestamp at time zone 'America/Fortaleza'
            )
        )
        and (
            p_data_fim is null
            or a.criado_em < (
                (p_data_fim + 1)::timestamp at time zone 'America/Fortaleza'
            )
        )
        and (
            nullif(trim(p_busca), '') is null
            or a.codigo_alerta ilike '%' || trim(p_busca) || '%'
            or a.ordem_servico ilike '%' || trim(p_busca) || '%'
            or a.recurso ilike '%' || trim(p_busca) || '%'
            or a.tipo_atividade ilike '%' || trim(p_busca) || '%'
            or a.fiscal_nome ilike '%' || trim(p_busca) || '%'
        )
),
base as (
    select *
    from base_periodo
    where
        nullif(trim(p_fiscal), '') is null
        or fiscal_nome = p_fiscal
),
resumo as (
    select
        count(*)::integer as total,
        count(*) filter (
            where status_tratamento = 'PENDENTE'
        )::integer as pendentes,
        count(*) filter (
            where status_tratamento = 'ENCERRADO'
        )::integer as encerrados
    from base
),
selecionados as (
    select *
    from base
    where
        nullif(trim(p_status), '') is null
        or upper(status_tratamento) = upper(p_status)
),
linhas as (
    select *
    from selecionados
    order by
        case when status_tratamento = 'PENDENTE' then 0 else 1 end,
        criado_em desc
    limit greatest(1, least(coalesce(p_limite, 500), 1000))
    offset greatest(coalesce(p_offset, 0), 0)
)
select jsonb_build_object(
    'resumo', jsonb_build_object(
        'total', r.total,
        'pendentes', r.pendentes,
        'encerrados', r.encerrados
    ),
    'total_resultados', (select count(*) from selecionados),
    'fiscais', coalesce(
        (
            select jsonb_agg(fiscal_nome order by fiscal_nome)
            from (
                select distinct fiscal_nome
                from base_periodo
                where nullif(trim(fiscal_nome), '') is not null
            ) fiscais_unicos
        ),
        '[]'::jsonb
    ),
    'alertas', coalesce(
        (
            select jsonb_agg(
                to_jsonb(l)
                || jsonb_build_object(
                    'url_tratamento',
                    'https://auditoria-campo.onrender.com/alertas/'
                        || l.token_tratamento::text,
                    'disparos', coalesce(
                        (
                            select jsonb_agg(
                                jsonb_build_object(
                                    'tipo_destino', d.tipo_destino,
                                    'destino_nome', d.destino_nome,
                                    'status_envio', d.status_envio,
                                    'preparado_em', d.preparado_em,
                                    'enviado_em', d.enviado_em,
                                    'erro', d.erro
                                )
                                order by d.preparado_em
                            )
                            from public.stc_disparos_whatsapp d
                            where d.alerta_key = l.alerta_key
                        ),
                        '[]'::jsonb
                    )
                )
                order by
                    case when l.status_tratamento = 'PENDENTE' then 0 else 1 end,
                    l.criado_em desc
            )
            from linhas l
        ),
        '[]'::jsonb
    )
)
from resumo r;
$$;

revoke all on function public.stc_painel_alertas_tma(
    text, text, text, date, date, integer, integer
) from public;

grant execute on function public.stc_painel_alertas_tma(
    text, text, text, date, date, integer, integer
) to anon, authenticated;

comment on function public.stc_painel_alertas_tma(
    text, text, text, date, date, integer, integer
) is 'Painel interno do VérticeGP para acompanhamento dos Alertas TMA.';

commit;
