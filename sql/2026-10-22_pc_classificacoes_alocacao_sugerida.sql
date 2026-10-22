-- Aplicar em ambos schemas: dev e public via Codex
--
-- Acrescenta a coluna de "alocação sugerida" em pc_classificacoes — pra
-- cada Classificação cadastrada em Padrões (ex.: VIAGEM, ABASTECIMENTO
-- VIATURA...) poder indicar qual categoria do campo "Alocado a" costuma
-- ser usada: COLABORADOR, EQUIPE_PREFIXO, VIATURA, BASE_OPERACIONAL,
-- TERCEIROS ou ADMINISTRATIVA (mesmos valores de CATEGORIAS_DESPESA em
-- src/modules/prestacaoContas/lib/categorias.js).
--
-- NULL = sem sugestão cadastrada pra essa classificação (comportamento de
-- hoje, sem nenhum aviso). Usada em PCItemForm/PCRevisaoEnvio/
-- PCItensComFotos pra pré-preencher o campo "Alocado a" quando ele ainda
-- está vazio e sinalizar (sem bloquear) quando a alocação escolhida
-- diverge da sugestão. Não altera nenhuma despesa já lançada.

ALTER TABLE dev.pc_classificacoes
  ADD COLUMN IF NOT EXISTS alocacao_sugerida text;

ALTER TABLE public.pc_classificacoes
  ADD COLUMN IF NOT EXISTS alocacao_sugerida text;
