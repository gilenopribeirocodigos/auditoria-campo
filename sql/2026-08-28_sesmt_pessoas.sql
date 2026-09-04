-- Aplicar em ambos schemas: dev e public via Codex
--
-- Fase 1 do novo modulo "Acoes SESMT": tabela de pessoas (CHAPA + NOME)
-- carregada so para este modulo, independente de estrutura_equipes e
-- eletricistas_cadastro. Usada pro autocomplete de participantes quando o
-- fiscal for registrar uma acao (Dialogo de Seguranca, Treinamento,
-- Reciclagem) nas proximas fases.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

create table if not exists dev.sesmt_pessoas (
  id            bigserial primary key,
  chapa         text not null,
  nome          text not null,
  ativo         boolean not null default true,
  carregado_por text,
  carregado_em  timestamptz not null default now()
);

create unique index if not exists ux_sesmt_pessoas_chapa
  on dev.sesmt_pessoas (chapa);

alter table dev.sesmt_pessoas disable row level security;
grant all on dev.sesmt_pessoas to anon, authenticated;
grant usage, select on dev.sesmt_pessoas_id_seq to anon, authenticated;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

create table if not exists public.sesmt_pessoas (
  id            bigserial primary key,
  chapa         text not null,
  nome          text not null,
  ativo         boolean not null default true,
  carregado_por text,
  carregado_em  timestamptz not null default now()
);

create unique index if not exists ux_sesmt_pessoas_chapa
  on public.sesmt_pessoas (chapa);

alter table public.sesmt_pessoas disable row level security;
grant all on public.sesmt_pessoas to anon, authenticated;
grant usage, select on public.sesmt_pessoas_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
