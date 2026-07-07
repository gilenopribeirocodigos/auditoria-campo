-- Estrutura Online: cadastro padrao de PROCESSO_EQUIPE.
-- Rodar em DEV (schema dev) e PRODUCAO (schema public).

create extension if not exists pgcrypto;

-- ============================================================================
-- DEV
-- ============================================================================

create table if not exists dev.processos_equipe_estrutura (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  ordem_exibicao integer not null default 999,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

insert into dev.processos_equipe_estrutura
  (descricao, ativo, ordem_exibicao)
values
  ('CORTE', true, 1),
  ('LIGACAO NOVA', true, 2),
  ('EMERGENCIAL', true, 3),
  ('PLANTAO', true, 4)
on conflict (descricao) do update set
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

create index if not exists idx_processos_equipe_estrutura_ordem_dev
  on dev.processos_equipe_estrutura (ativo, ordem_exibicao, descricao);

-- ============================================================================
-- PUBLIC
-- ============================================================================

create table if not exists public.processos_equipe_estrutura (
  id uuid primary key default gen_random_uuid(),
  descricao text not null unique,
  ativo boolean not null default true,
  ordem_exibicao integer not null default 999,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);

insert into public.processos_equipe_estrutura
  (descricao, ativo, ordem_exibicao)
values
  ('CORTE', true, 1),
  ('LIGACAO NOVA', true, 2),
  ('EMERGENCIAL', true, 3),
  ('PLANTAO', true, 4)
on conflict (descricao) do update set
  ativo = excluded.ativo,
  ordem_exibicao = excluded.ordem_exibicao,
  atualizado_em = now();

create index if not exists idx_processos_equipe_estrutura_ordem_public
  on public.processos_equipe_estrutura (ativo, ordem_exibicao, descricao);
