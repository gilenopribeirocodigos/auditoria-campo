-- Regionais liberadas por usuario para segregacao da estrutura.
-- Aplicar nos schemas dev e public.

create table if not exists dev.usuarios_regionais (
  id bigserial primary key,
  usuario_id bigint not null,
  regional_chave text not null,
  criado_em timestamptz not null default now(),
  unique (usuario_id, regional_chave)
);

create index if not exists idx_dev_usuarios_regionais_usuario
  on dev.usuarios_regionais (usuario_id);

create table if not exists public.usuarios_regionais (
  id bigserial primary key,
  usuario_id bigint not null,
  regional_chave text not null,
  criado_em timestamptz not null default now(),
  unique (usuario_id, regional_chave)
);

create index if not exists idx_public_usuarios_regionais_usuario
  on public.usuarios_regionais (usuario_id);
