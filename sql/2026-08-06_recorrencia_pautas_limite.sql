-- Aplicar em ambos schemas: dev e public via Codex
--
-- Limite de recorrência das pautas (Diária/Semanal) + botão "Parar Recorrência".
-- Hoje uma pauta recorrente gera a próxima pra sempre (criarProximaRecorrencia,
-- em src/lib/pautas.js) sem nenhuma condição de parada. Isso adiciona:
--   - recorrencia_origem_id: aponta pra pauta ORIGINAL da cadeia (raiz), em toda
--     pauta gerada automaticamente. Na pauta raiz, fica NULL.
--   - recorrencia_max_execucoes / recorrencia_fim_data: condição de parada
--     opcional, definida na criação da pauta raiz.
--   - recorrencia_execucoes_geradas: contador de quantas execuções já saíram
--     dessa cadeia (vive só na raiz).
--   - recorrencia_ativa: kill-switch manual (botão "Parar Recorrência"), default
--     true pra não alterar o comportamento das cadeias já existentes.
--
-- Sem FK (recorrencia_origem_id é referência solta, mesmo padrão já usado pra
-- outras colunas de rastreio no projeto) — evita os problemas de constraint
-- rígida que já tivemos com reimportação de estrutura.

alter table dev.pautas
  add column if not exists recorrencia_origem_id bigint,
  add column if not exists recorrencia_max_execucoes integer,
  add column if not exists recorrencia_fim_data date,
  add column if not exists recorrencia_execucoes_geradas integer default 1,
  add column if not exists recorrencia_ativa boolean default true;

create index if not exists idx_dev_pautas_recorrencia_origem
  on dev.pautas (recorrencia_origem_id);

alter table public.pautas
  add column if not exists recorrencia_origem_id bigint,
  add column if not exists recorrencia_max_execucoes integer,
  add column if not exists recorrencia_fim_data date,
  add column if not exists recorrencia_execucoes_geradas integer default 1,
  add column if not exists recorrencia_ativa boolean default true;

create index if not exists idx_public_pautas_recorrencia_origem
  on public.pautas (recorrencia_origem_id);
