-- Coluna opcional de CPF do colaborador em estrutura_equipes (e no histórico
-- de movimentações), mesmo padrão de descr_secao/matricula_superv_campo.
-- Fica NULL/vazia se a planilha (Estrutura Online ou CSV) não trouxer essa
-- coluna. Uso futuro: cruzar com a extração do SIGA (vw_toa_extracao_completa
-- já traz CPF) na Justificativa em Lote, que hoje casa só por nome.

alter table if exists dev.estrutura_equipes
  add column if not exists cpf_colaborador text;

alter table if exists dev.historico_estrutura_equipes
  add column if not exists cpf_colaborador text;

alter table if exists public.estrutura_equipes
  add column if not exists cpf_colaborador text;

alter table if exists public.historico_estrutura_equipes
  add column if not exists cpf_colaborador text;

notify pgrst, 'reload schema';
