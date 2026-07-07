-- Remove FKs legadas que prendem registros historicos na estrutura atual.
--
-- A tabela estrutura_equipes e recriada/atualizada a cada carga. Registros de
-- indisponibilidade e remanejamento preservam seus dados historicos e nao devem
-- impedir uma nova importacao da estrutura.

alter table if exists dev.indisponibilidades
  drop constraint if exists indisponibilidades_eletricista_id_fkey;

alter table if exists dev.indisponibilidades
  drop constraint if exists indisponibilidades_eletricista2_id_fkey;

alter table if exists dev.remanejamentos
  drop constraint if exists remanejamentos_eletricista_id_fkey;

alter table if exists public.indisponibilidades
  drop constraint if exists indisponibilidades_eletricista_id_fkey;

alter table if exists public.indisponibilidades
  drop constraint if exists indisponibilidades_eletricista2_id_fkey;

alter table if exists public.remanejamentos
  drop constraint if exists remanejamentos_eletricista_id_fkey;
