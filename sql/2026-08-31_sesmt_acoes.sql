-- Aplicar em ambos schemas: dev e public via Codex
--
-- Fase 2 do modulo "Acoes SESMT": tabelas para registrar a acao em si
-- (Dialogo de Seguranca / Treinamento / Reciclagem), com evidencias e
-- assinaturas — independentes de Auditoria/Registros Operacionais (sem FK
-- com essas tabelas, mesmo padrao adotado pra sesmt_pessoas).
--
-- sesmt_acoes segue o mesmo padrao ja usado em registros_operacionais:
-- fotos e participantes ficam em colunas jsonb na propria linha (nao em
-- tabelas separadas) — participantes so entram nesse array quando ja tem
-- assinatura (presencial na hora, ou coletada via link depois).
--
-- sesmt_assinaturas_pendentes / sesmt_assinaturas_coletadas espelham
-- assinaturas_pendentes / assinaturas_coletadas (ja usadas em Registros
-- Operacionais): token com expiracao, pra assinatura remota via link/QR.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

create table if not exists dev.sesmt_motivos (
  id        bigserial primary key,
  tipo      text not null,
  motivo    text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tipo, motivo)
);

create table if not exists dev.sesmt_acoes (
  id               bigserial primary key,
  tipo             text not null,
  tema             text,
  motivo           text,
  observacao       text,
  fiscal           text,
  matricula_fiscal text,
  data_registro    date not null,
  hora_registro    text,
  participantes    jsonb not null default '[]'::jsonb,
  fotos_urls       jsonb not null default '[]'::jsonb,
  status           text not null default 'CONCLUIDA',
  criado_em        timestamptz not null default now()
);

create table if not exists dev.sesmt_assinaturas_pendentes (
  id         bigserial primary key,
  token      uuid not null default gen_random_uuid() unique,
  acao_id    bigint not null,
  status     text not null default 'ABERTO',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists dev.sesmt_assinaturas_coletadas (
  id                   bigserial primary key,
  token_id             bigint not null,
  acao_id              bigint not null,
  nome                 text not null,
  matricula            text,
  assinatura_url       text,
  latitude             double precision,
  longitude            double precision,
  endereco_assinatura  text,
  assinado_em          timestamptz not null default now()
);

alter table dev.sesmt_motivos disable row level security;
alter table dev.sesmt_acoes disable row level security;
alter table dev.sesmt_assinaturas_pendentes disable row level security;
alter table dev.sesmt_assinaturas_coletadas disable row level security;

grant all on dev.sesmt_motivos to anon, authenticated;
grant all on dev.sesmt_acoes to anon, authenticated;
grant all on dev.sesmt_assinaturas_pendentes to anon, authenticated;
grant all on dev.sesmt_assinaturas_coletadas to anon, authenticated;

grant usage, select on dev.sesmt_motivos_id_seq to anon, authenticated;
grant usage, select on dev.sesmt_acoes_id_seq to anon, authenticated;
grant usage, select on dev.sesmt_assinaturas_pendentes_id_seq to anon, authenticated;
grant usage, select on dev.sesmt_assinaturas_coletadas_id_seq to anon, authenticated;

insert into dev.sesmt_motivos (tipo, motivo) values
  ('DIALOGO_SEGURANCA', 'USO DE EPI/EPC'),
  ('DIALOGO_SEGURANCA', 'RISCO ELÉTRICO (CHOQUE/ARCO ELÉTRICO)'),
  ('DIALOGO_SEGURANCA', 'TRABALHO EM ALTURA'),
  ('DIALOGO_SEGURANCA', 'BLOQUEIO E ETIQUETAGEM (LOTO)'),
  ('DIALOGO_SEGURANCA', 'DISTÂNCIA MÍNIMA DE SEGURANÇA'),
  ('DIALOGO_SEGURANCA', 'CONDIÇÕES CLIMÁTICAS'),
  ('DIALOGO_SEGURANCA', 'DIREÇÃO DEFENSIVA/USO DE VIATURA'),
  ('DIALOGO_SEGURANCA', 'ORDEM E LIMPEZA (5S)'),
  ('DIALOGO_SEGURANCA', 'ANÁLISE PRELIMINAR DE RISCO (APR)'),
  ('DIALOGO_SEGURANCA', 'CUMPRIMENTO DE PROCEDIMENTO DE SEGURANÇA'),
  ('DIALOGO_SEGURANCA', 'OUTROS'),

  ('TREINAMENTO', 'NRS (NR-10, NR-35, ETC)'),
  ('TREINAMENTO', 'USO DE EQUIPAMENTO/FERRAMENTA NOVA'),
  ('TREINAMENTO', 'PROCEDIMENTO OPERACIONAL PADRÃO (POP)'),
  ('TREINAMENTO', 'DIREÇÃO DEFENSIVA'),
  ('TREINAMENTO', 'OUTROS'),

  ('RECICLAGEM', 'NR-10'),
  ('RECICLAGEM', 'NR-35'),
  ('RECICLAGEM', 'PRIMEIROS SOCORROS'),
  ('RECICLAGEM', 'OUTROS')
on conflict (tipo, motivo) do nothing;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

create table if not exists public.sesmt_motivos (
  id        bigserial primary key,
  tipo      text not null,
  motivo    text not null,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (tipo, motivo)
);

create table if not exists public.sesmt_acoes (
  id               bigserial primary key,
  tipo             text not null,
  tema             text,
  motivo           text,
  observacao       text,
  fiscal           text,
  matricula_fiscal text,
  data_registro    date not null,
  hora_registro    text,
  participantes    jsonb not null default '[]'::jsonb,
  fotos_urls       jsonb not null default '[]'::jsonb,
  status           text not null default 'CONCLUIDA',
  criado_em        timestamptz not null default now()
);

create table if not exists public.sesmt_assinaturas_pendentes (
  id         bigserial primary key,
  token      uuid not null default gen_random_uuid() unique,
  acao_id    bigint not null,
  status     text not null default 'ABERTO',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sesmt_assinaturas_coletadas (
  id                   bigserial primary key,
  token_id             bigint not null,
  acao_id              bigint not null,
  nome                 text not null,
  matricula            text,
  assinatura_url       text,
  latitude             double precision,
  longitude            double precision,
  endereco_assinatura  text,
  assinado_em          timestamptz not null default now()
);

alter table public.sesmt_motivos disable row level security;
alter table public.sesmt_acoes disable row level security;
alter table public.sesmt_assinaturas_pendentes disable row level security;
alter table public.sesmt_assinaturas_coletadas disable row level security;

grant all on public.sesmt_motivos to anon, authenticated;
grant all on public.sesmt_acoes to anon, authenticated;
grant all on public.sesmt_assinaturas_pendentes to anon, authenticated;
grant all on public.sesmt_assinaturas_coletadas to anon, authenticated;

grant usage, select on public.sesmt_motivos_id_seq to anon, authenticated;
grant usage, select on public.sesmt_acoes_id_seq to anon, authenticated;
grant usage, select on public.sesmt_assinaturas_pendentes_id_seq to anon, authenticated;
grant usage, select on public.sesmt_assinaturas_coletadas_id_seq to anon, authenticated;

insert into public.sesmt_motivos (tipo, motivo) values
  ('DIALOGO_SEGURANCA', 'USO DE EPI/EPC'),
  ('DIALOGO_SEGURANCA', 'RISCO ELÉTRICO (CHOQUE/ARCO ELÉTRICO)'),
  ('DIALOGO_SEGURANCA', 'TRABALHO EM ALTURA'),
  ('DIALOGO_SEGURANCA', 'BLOQUEIO E ETIQUETAGEM (LOTO)'),
  ('DIALOGO_SEGURANCA', 'DISTÂNCIA MÍNIMA DE SEGURANÇA'),
  ('DIALOGO_SEGURANCA', 'CONDIÇÕES CLIMÁTICAS'),
  ('DIALOGO_SEGURANCA', 'DIREÇÃO DEFENSIVA/USO DE VIATURA'),
  ('DIALOGO_SEGURANCA', 'ORDEM E LIMPEZA (5S)'),
  ('DIALOGO_SEGURANCA', 'ANÁLISE PRELIMINAR DE RISCO (APR)'),
  ('DIALOGO_SEGURANCA', 'CUMPRIMENTO DE PROCEDIMENTO DE SEGURANÇA'),
  ('DIALOGO_SEGURANCA', 'OUTROS'),

  ('TREINAMENTO', 'NRS (NR-10, NR-35, ETC)'),
  ('TREINAMENTO', 'USO DE EQUIPAMENTO/FERRAMENTA NOVA'),
  ('TREINAMENTO', 'PROCEDIMENTO OPERACIONAL PADRÃO (POP)'),
  ('TREINAMENTO', 'DIREÇÃO DEFENSIVA'),
  ('TREINAMENTO', 'OUTROS'),

  ('RECICLAGEM', 'NR-10'),
  ('RECICLAGEM', 'NR-35'),
  ('RECICLAGEM', 'PRIMEIROS SOCORROS'),
  ('RECICLAGEM', 'OUTROS')
on conflict (tipo, motivo) do nothing;

notify pgrst, 'reload schema';
