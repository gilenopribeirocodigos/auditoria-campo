-- Adiciona descr_secao ao modelo de estrutura importada.
-- Rodar em DEV (schema dev) e PRODUCAO (schema public).

alter table if exists dev.estrutura_equipes
  add column if not exists descr_secao text;

alter table if exists dev.historico_estrutura_equipes
  add column if not exists descr_secao text;

alter table if exists public.estrutura_equipes
  add column if not exists descr_secao text;

alter table if exists public.historico_estrutura_equipes
  add column if not exists descr_secao text;
