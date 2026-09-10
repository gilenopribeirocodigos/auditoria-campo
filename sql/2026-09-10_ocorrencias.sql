-- Aplicar em ambos schemas: dev e public via Codex
--
-- Modulo "Ocorrencias": almoxarifado relata um problema (ex: devolucao de
-- medidor/sucata nao realizada) e direciona manualmente para um fiscal/
-- supervisor tratar. Tabela independente — sem FK com auditorias,
-- auditorias_nao_conformes ou registros_operacionais (mesmo padrao ja
-- adotado para sesmt_acoes/sesmt_pessoas).
--
-- Abertura: tela dedicada dentro do modulo Registros Operacionais (botao
-- "Abertura de Ocorrencia"). Tratamento: nova aba "Ocorrencias" dentro da
-- tela Tratamento de Nao Conformidades (mesmo lugar que o fiscal ja visita
-- todo dia).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

create table if not exists dev.ocorrencias (
  id                        bigserial primary key,
  numero_ocorrencia         text,
  descricao                 text not null,
  eletricista_equipe        text,
  prefixo                   text,
  aberto_por                text not null,
  matricula_aberto_por      text,
  direcionado_para          text not null,
  matricula_fiscal_destino  text,
  foto_url                  text,
  status                    text not null default 'PENDENTE',
  tratado_por               text,
  tratamento_observacao     text,
  tratado_em                timestamptz,
  criado_em                 timestamptz not null default now()
);

alter table dev.ocorrencias disable row level security;
grant all on dev.ocorrencias to anon, authenticated;
grant usage, select on dev.ocorrencias_id_seq to anon, authenticated;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

create table if not exists public.ocorrencias (
  id                        bigserial primary key,
  numero_ocorrencia         text,
  descricao                 text not null,
  eletricista_equipe        text,
  prefixo                   text,
  aberto_por                text not null,
  matricula_aberto_por      text,
  direcionado_para          text not null,
  matricula_fiscal_destino  text,
  foto_url                  text,
  status                    text not null default 'PENDENTE',
  tratado_por               text,
  tratamento_observacao     text,
  tratado_em                timestamptz,
  criado_em                 timestamptz not null default now()
);

alter table public.ocorrencias disable row level security;
grant all on public.ocorrencias to anon, authenticated;
grant usage, select on public.ocorrencias_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
