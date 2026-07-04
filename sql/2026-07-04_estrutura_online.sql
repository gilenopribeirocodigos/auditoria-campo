-- Estrutura Online: abas editaveis, motivos padrao de situacao e historico de importacoes.
-- Rodar em DEV (schema dev) e PRODUCAO (schema public).

create extension if not exists pgcrypto;

-- ============================================================================
-- DEV
-- ============================================================================

create table if not exists dev.motivos_situacao_estrutura (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  cor_fundo text not null default '#f8fafc',
  cor_texto text not null default '#334155',
  permite_importar_estrutura boolean not null default false,
  ativo boolean not null default true,
  ordem_exibicao integer not null default 999,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

insert into dev.motivos_situacao_estrutura
  (descricao, cor_fundo, cor_texto, permite_importar_estrutura, ativo, ordem_exibicao)
values
  ('ATIVO', '#dcfce7', '#166534', true, true, 1),
  ('RESERVA', '#dbeafe', '#1e40af', true, true, 2),
  ('TRANSFERIDO', '#f3e8ff', '#6b21a8', false, true, 10),
  ('AF.PREVIDENCIA', '#fef3c7', '#92400e', false, true, 11),
  ('DESLIGADO', '#fee2e2', '#991b1b', false, true, 12),
  ('DESAPARECIDO', '#bbf7d0', '#166534', false, true, 13),
  ('BLOQUEADO', '#ffedd5', '#9a3412', false, true, 14),
  ('NAO APRESENTADO', '#ffffff', '#334155', false, true, 15)
on conflict (descricao) do update set
  cor_fundo = excluded.cor_fundo,
  cor_texto = excluded.cor_texto,
  permite_importar_estrutura = excluded.permite_importar_estrutura,
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

create table if not exists dev.estrutura_planilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem integer not null default 1,
  ativo boolean not null default true,
  status text not null default 'SALVO',
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_estrutura_planilhas_ordem_dev
  on dev.estrutura_planilhas (ativo, ordem, nome);

create table if not exists dev.estrutura_planilha_linhas (
  id uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references dev.estrutura_planilhas(id) on delete cascade,
  ordem integer not null default 1,
  dados jsonb not null default '{}'::jsonb,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_estrutura_planilha_linhas_planilha_dev
  on dev.estrutura_planilha_linhas (planilha_id, ordem);

create table if not exists dev.estrutura_planilha_importacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_login text,
  usuario_nome text,
  total_linhas integer not null default 0,
  linhas_importadas integer not null default 0,
  resumo jsonb not null default '{}'::jsonb,
  status text not null default 'CONCLUIDA',
  criado_em timestamptz not null default now()
);

-- ============================================================================
-- PUBLIC
-- ============================================================================

create table if not exists public.motivos_situacao_estrutura (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  cor_fundo text not null default '#f8fafc',
  cor_texto text not null default '#334155',
  permite_importar_estrutura boolean not null default false,
  ativo boolean not null default true,
  ordem_exibicao integer not null default 999,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

insert into public.motivos_situacao_estrutura
  (descricao, cor_fundo, cor_texto, permite_importar_estrutura, ativo, ordem_exibicao)
values
  ('ATIVO', '#dcfce7', '#166534', true, true, 1),
  ('RESERVA', '#dbeafe', '#1e40af', true, true, 2),
  ('TRANSFERIDO', '#f3e8ff', '#6b21a8', false, true, 10),
  ('AF.PREVIDENCIA', '#fef3c7', '#92400e', false, true, 11),
  ('DESLIGADO', '#fee2e2', '#991b1b', false, true, 12),
  ('DESAPARECIDO', '#bbf7d0', '#166534', false, true, 13),
  ('BLOQUEADO', '#ffedd5', '#9a3412', false, true, 14),
  ('NAO APRESENTADO', '#ffffff', '#334155', false, true, 15)
on conflict (descricao) do update set
  cor_fundo = excluded.cor_fundo,
  cor_texto = excluded.cor_texto,
  permite_importar_estrutura = excluded.permite_importar_estrutura,
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

create table if not exists public.estrutura_planilhas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ordem integer not null default 1,
  ativo boolean not null default true,
  status text not null default 'SALVO',
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_estrutura_planilhas_ordem_public
  on public.estrutura_planilhas (ativo, ordem, nome);

create table if not exists public.estrutura_planilha_linhas (
  id uuid primary key default gen_random_uuid(),
  planilha_id uuid not null references public.estrutura_planilhas(id) on delete cascade,
  ordem integer not null default 1,
  dados jsonb not null default '{}'::jsonb,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_estrutura_planilha_linhas_planilha_public
  on public.estrutura_planilha_linhas (planilha_id, ordem);

create table if not exists public.estrutura_planilha_importacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_login text,
  usuario_nome text,
  total_linhas integer not null default 0,
  linhas_importadas integer not null default 0,
  resumo jsonb not null default '{}'::jsonb,
  status text not null default 'CONCLUIDA',
  criado_em timestamptz not null default now()
);
