-- Remove a FK legado que prendia registros historicos de frequencia
-- (`equipes_dia.eletricista_id`) na tabela mutavel `estrutura_equipes`.
--
-- A importacao de estrutura recria a tabela atual de equipes. Os registros de
-- frequencia preservam o snapshot do colaborador e o `id_eletricista`
-- permanente, portanto nao devem bloquear a carga de uma nova estrutura.

alter table if exists dev.equipes_dia
  drop constraint if exists equipes_dia_eletricista_id_fkey;

alter table if exists public.equipes_dia
  drop constraint if exists equipes_dia_eletricista_id_fkey;
