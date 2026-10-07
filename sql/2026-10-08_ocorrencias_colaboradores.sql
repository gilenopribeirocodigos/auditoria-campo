-- Aplicar em ambos schemas: dev e public via Codex
--
-- Tabela nova: ocorrencias_colaboradores — 1 linha por colaborador vinculado
-- a uma Ocorrência (abertura normal ou importação em lote), cada um com sua
-- própria assinatura. Substitui o limite fixo de 2 colaboradores que hoje
-- existe só nas colunas eletricista_equipe/eletricista_equipe_2 e
-- tratamento_assinatura_url/tratamento_assinatura2_url de "ocorrencias" —
-- essas colunas NÃO são removidas (continuam preenchidas com os 2 primeiros,
-- como resumo/compatibilidade pro PDF/WhatsApp/exportações que já leem
-- direto delas). A tabela nova é a fonte de verdade pra tela de tratamento,
-- que passa a abrir 1 vaga de assinatura por colaborador real da equipe
-- (mínimo de 2 assinaturas — ou 1, se a equipe só tiver 1 pessoa — pra
-- liberar "Confirmar Tratamento"; quem não assinar naquela rodada
-- simplesmente não fica registrado como cientificado).
--
-- Ocorrências já existentes (criadas antes desta migração) não têm linhas
-- aqui — o app detecta isso e cai automaticamente no comportamento antigo
-- (2 vagas fixas) pra elas, sem quebrar nada do histórico.

create table if not exists dev.ocorrencias_colaboradores (
  id             bigint generated always as identity primary key,
  ocorrencia_id  bigint not null references dev.ocorrencias(id) on delete cascade,
  ordem          int not null default 1,
  nome           text not null,
  matricula      text,
  assinatura_url text,
  assinado_em    timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_dev_ocorrencias_colaboradores_ocorrencia_id
  on dev.ocorrencias_colaboradores (ocorrencia_id);
alter table dev.ocorrencias_colaboradores disable row level security;
grant all on dev.ocorrencias_colaboradores to anon, authenticated;

create table if not exists public.ocorrencias_colaboradores (
  id             bigint generated always as identity primary key,
  ocorrencia_id  bigint not null references public.ocorrencias(id) on delete cascade,
  ordem          int not null default 1,
  nome           text not null,
  matricula      text,
  assinatura_url text,
  assinado_em    timestamptz,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_public_ocorrencias_colaboradores_ocorrencia_id
  on public.ocorrencias_colaboradores (ocorrencia_id);
alter table public.ocorrencias_colaboradores disable row level security;
grant all on public.ocorrencias_colaboradores to anon, authenticated;
