-- Aplicar em ambos schemas: dev e public via Codex
--
-- Abertura de Ocorrência passa a aceitar um 2º colaborador envolvido
-- (opcional) — precisa de coluna pra gravar o nome dele e, no tratamento,
-- de colunas pra gravar a assinatura dele (mesmo padrão de
-- tratamento_assinatura2_url/nome já usado em auditorias_nao_conformes).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.ocorrencias add column if not exists eletricista_equipe_2 text;
alter table dev.ocorrencias add column if not exists tratamento_assinatura2_url text;
alter table dev.ocorrencias add column if not exists tratamento_assinatura2_nome text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.ocorrencias add column if not exists eletricista_equipe_2 text;
alter table public.ocorrencias add column if not exists tratamento_assinatura2_url text;
alter table public.ocorrencias add column if not exists tratamento_assinatura2_nome text;

notify pgrst, 'reload schema';
