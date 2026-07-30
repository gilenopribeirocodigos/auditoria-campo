begin;

create or replace function public.stc_obter_alerta_por_token(p_token uuid)
returns table (
    codigo_alerta text,
    criado_em timestamptz,
    recurso text,
    lider text,
    ordem_servico text,
    tipo_atividade text,
    grupo_atividade text,
    inicio_atividade text,
    tempo_apurado_hhmmss text,
    tempo_limite_min integer,
    status_tratamento text,
    fiscal_nome text,
    encerrado_em timestamptz,
    encerrado_por text,
    justificativa_encerramento text
)
language sql
stable
security definer
set search_path = public
as $$
    select
        a.codigo_alerta,
        a.criado_em,
        a.recurso,
        a.lider,
        a.ordem_servico,
        a.tipo_atividade,
        a.grupo_atividade,
        a.inicio_atividade,
        a.tempo_apurado_hhmmss,
        a.tempo_limite_min,
        a.status_tratamento,
        a.fiscal_nome,
        a.encerrado_em,
        a.encerrado_por,
        a.justificativa_encerramento
    from public.stc_alertas a
    where a.token_tratamento = p_token
    limit 1;
$$;

create or replace function public.stc_encerrar_alerta(
    p_token uuid,
    p_encerrado_por text,
    p_justificativa text
)
returns table (
    codigo_alerta text,
    criado_em timestamptz,
    recurso text,
    lider text,
    ordem_servico text,
    tipo_atividade text,
    grupo_atividade text,
    inicio_atividade text,
    tempo_apurado_hhmmss text,
    tempo_limite_min integer,
    status_tratamento text,
    fiscal_nome text,
    encerrado_em timestamptz,
    encerrado_por text,
    justificativa_encerramento text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_nome text := btrim(coalesce(p_encerrado_por, ''));
    v_justificativa text := btrim(coalesce(p_justificativa, ''));
begin
    if p_token is null then
        raise exception 'Link de tratamento inválido.';
    end if;

    if char_length(v_nome) < 2 then
        raise exception 'Informe o nome de quem está encerrando.';
    end if;

    if char_length(v_nome) > 120 then
        raise exception 'O nome informado ultrapassa 120 caracteres.';
    end if;

    if char_length(v_justificativa) < 10 then
        raise exception 'A justificativa precisa ter pelo menos 10 caracteres.';
    end if;

    if char_length(v_justificativa) > 2000 then
        raise exception 'A justificativa ultrapassa 2000 caracteres.';
    end if;

    update public.stc_alertas a
    set
        status_tratamento = 'ENCERRADO',
        encerrado_em = now(),
        encerrado_por = v_nome,
        justificativa_encerramento = v_justificativa,
        atualizado_em = now()
    where
        a.token_tratamento = p_token
        and a.status_tratamento = 'PENDENTE';

    if not found and not exists (
        select 1
        from public.stc_alertas a
        where a.token_tratamento = p_token
          and a.status_tratamento = 'ENCERRADO'
    ) then
        raise exception 'Alerta não encontrado ou indisponível.';
    end if;

    return query
    select
        a.codigo_alerta,
        a.criado_em,
        a.recurso,
        a.lider,
        a.ordem_servico,
        a.tipo_atividade,
        a.grupo_atividade,
        a.inicio_atividade,
        a.tempo_apurado_hhmmss,
        a.tempo_limite_min,
        a.status_tratamento,
        a.fiscal_nome,
        a.encerrado_em,
        a.encerrado_por,
        a.justificativa_encerramento
    from public.stc_alertas a
    where a.token_tratamento = p_token
    limit 1;
end;
$$;

revoke all on function public.stc_obter_alerta_por_token(uuid) from public;
revoke all on function public.stc_encerrar_alerta(uuid, text, text) from public;

grant execute on function public.stc_obter_alerta_por_token(uuid)
    to anon, authenticated;

grant execute on function public.stc_encerrar_alerta(uuid, text, text)
    to anon, authenticated;

comment on function public.stc_obter_alerta_por_token(uuid) is
    'Consulta pública e limitada de um alerta STC pelo token do link.';

comment on function public.stc_encerrar_alerta(uuid, text, text) is
    'Encerra uma única vez o alerta STC, exigindo responsável e justificativa.';

commit;
