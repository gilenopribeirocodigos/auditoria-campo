-- Aplicar em ambos schemas: dev e public via Codex
-- Status agregado de tratamento de Não Conformidades, espelhado da
-- auditoria pra pauta vinculada (pauta.auditoria_id).
-- Valores: NULL (sem NC) | 'PENDENTE' | 'TRATADA'

alter table if exists dev.auditorias
  add column if not exists nc_status text;

alter table if exists dev.pautas
  add column if not exists nc_status text;

create index if not exists idx_dev_auditorias_nc_status
  on dev.auditorias (nc_status);

create index if not exists idx_dev_pautas_nc_status
  on dev.pautas (nc_status);

alter table if exists public.auditorias
  add column if not exists nc_status text;

alter table if exists public.pautas
  add column if not exists nc_status text;

create index if not exists idx_public_auditorias_nc_status
  on public.auditorias (nc_status);

create index if not exists idx_public_pautas_nc_status
  on public.pautas (nc_status);

notify pgrst, 'reload schema';
