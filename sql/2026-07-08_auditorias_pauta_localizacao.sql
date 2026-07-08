-- Espelho dos dados de pauta dentro da auditoria final.
-- Rodar em DESENVOLVIMENTO (dev) e PRODUCAO (public).

alter table dev.auditorias
  add column if not exists pauta_id bigint,
  add column if not exists latitude_pauta numeric,
  add column if not exists longitude_pauta numeric,
  add column if not exists cidade text,
  add column if not exists bairro text,
  add column if not exists endereco_referencia text,
  add column if not exists data_os date,
  add column if not exists prioridade_execucao integer;

create index if not exists idx_dev_auditorias_pauta_id
  on dev.auditorias (pauta_id);

create index if not exists idx_dev_auditorias_prioridade_execucao
  on dev.auditorias (prioridade_execucao);

alter table public.auditorias
  add column if not exists pauta_id bigint,
  add column if not exists latitude_pauta numeric,
  add column if not exists longitude_pauta numeric,
  add column if not exists cidade text,
  add column if not exists bairro text,
  add column if not exists endereco_referencia text,
  add column if not exists data_os date,
  add column if not exists prioridade_execucao integer;

create index if not exists idx_public_auditorias_pauta_id
  on public.auditorias (pauta_id);

create index if not exists idx_public_auditorias_prioridade_execucao
  on public.auditorias (prioridade_execucao);

notify pgrst, 'reload schema';
