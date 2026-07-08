-- Campos opcionais para roteiro/localizacao e prioridade de execucao da pauta.
-- Rodar nos schemas dev e public.

alter table dev.pautas
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists cidade text,
  add column if not exists bairro text,
  add column if not exists endereco_referencia text,
  add column if not exists data_os date,
  add column if not exists prioridade_execucao integer;

create index if not exists idx_dev_pautas_execucao
  on dev.pautas (status, fiscal_login, data_prevista, prioridade_execucao);

alter table public.pautas
  add column if not exists latitude numeric(10,7),
  add column if not exists longitude numeric(10,7),
  add column if not exists cidade text,
  add column if not exists bairro text,
  add column if not exists endereco_referencia text,
  add column if not exists data_os date,
  add column if not exists prioridade_execucao integer;

create index if not exists idx_public_pautas_execucao
  on public.pautas (status, fiscal_login, data_prevista, prioridade_execucao);
