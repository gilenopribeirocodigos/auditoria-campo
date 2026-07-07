-- Estrutura Online: motivo padrao para linhas sem matricula ou colaborador.
-- Rodar em DEV (schema dev) e PRODUCAO (schema public).

insert into dev.motivos_situacao_estrutura
  (descricao, cor_fundo, cor_texto, permite_importar_estrutura, ativo, ordem_exibicao)
values
  ('SEM ELETRICISTA', '#f1f5f9', '#334155', false, true, 99)
on conflict (descricao) do update set
  cor_fundo = excluded.cor_fundo,
  cor_texto = excluded.cor_texto,
  permite_importar_estrutura = excluded.permite_importar_estrutura,
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

update dev.estrutura_planilha_linhas
set
  dados = jsonb_set(dados, '{descr_situacao}', to_jsonb('SEM ELETRICISTA'::text), true),
  atualizado_em = now()
where
  (
    nullif(trim(coalesce(dados->>'matricula', '')), '') is null
    or nullif(trim(coalesce(dados->>'colaborador', '')), '') is null
  )
  and exists (
    select 1
    from jsonb_each_text(dados) as campo(chave, valor)
    where campo.chave <> 'descr_situacao'
      and nullif(trim(campo.valor), '') is not null
  );

insert into public.motivos_situacao_estrutura
  (descricao, cor_fundo, cor_texto, permite_importar_estrutura, ativo, ordem_exibicao)
values
  ('SEM ELETRICISTA', '#f1f5f9', '#334155', false, true, 99)
on conflict (descricao) do update set
  cor_fundo = excluded.cor_fundo,
  cor_texto = excluded.cor_texto,
  permite_importar_estrutura = excluded.permite_importar_estrutura,
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

update public.estrutura_planilha_linhas
set
  dados = jsonb_set(dados, '{descr_situacao}', to_jsonb('SEM ELETRICISTA'::text), true),
  atualizado_em = now()
where
  (
    nullif(trim(coalesce(dados->>'matricula', '')), '') is null
    or nullif(trim(coalesce(dados->>'colaborador', '')), '') is null
  )
  and exists (
    select 1
    from jsonb_each_text(dados) as campo(chave, valor)
    where campo.chave <> 'descr_situacao'
      and nullif(trim(campo.valor), '') is not null
  );
