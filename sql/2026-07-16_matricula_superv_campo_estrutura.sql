-- Adiciona matricula_superv_campo ao modelo de estrutura importada.
-- Guarda a matrícula do Supervisor de Campo de cada linha, pra permitir
-- vincular de verdade com dev.usuarios/public.usuarios (mesma matrícula do
-- usuário) em vez de casar só pelo nome (matchNomes) — usado hoje em
-- src/components/PainelFiltros.jsx e src/pages/MapaFiscais.jsx.
-- Só cria a coluna; a lógica de filtro/permissão continua usando o
-- casamento por nome por enquanto (fica pra uma etapa futura, depois que a
-- matrícula estiver populada na maior parte dos dados).
-- Rodar em DEV (schema dev) e PRODUCAO (schema public).

alter table if exists dev.estrutura_equipes
  add column if not exists matricula_superv_campo text;

alter table if exists dev.historico_estrutura_equipes
  add column if not exists matricula_superv_campo text;

alter table if exists public.estrutura_equipes
  add column if not exists matricula_superv_campo text;

alter table if exists public.historico_estrutura_equipes
  add column if not exists matricula_superv_campo text;
