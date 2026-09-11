-- Aplicar em ambos schemas: dev e public via Codex
--
-- O tratamento de uma Ocorrência passa a exigir evidência (foto) e
-- assinatura do colaborador envolvido, igual ao tratamento de Não
-- Conformidade (auditorias_nao_conformes) — precisa de colunas novas
-- pra gravar isso.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.ocorrencias add column if not exists tratamento_fotos_urls jsonb not null default '[]'::jsonb;
alter table dev.ocorrencias add column if not exists tratamento_assinatura_url text;
alter table dev.ocorrencias add column if not exists tratamento_assinatura_nome text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.ocorrencias add column if not exists tratamento_fotos_urls jsonb not null default '[]'::jsonb;
alter table public.ocorrencias add column if not exists tratamento_assinatura_url text;
alter table public.ocorrencias add column if not exists tratamento_assinatura_nome text;

notify pgrst, 'reload schema';
