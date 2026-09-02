-- Aplicar em ambos schemas: dev e public via Codex
--
-- Adiciona a REGIONAL da ação em sesmt_acoes — usada como filtro no
-- Histórico (mesmo padrão de Regional já usado no resto do app). Não vem
-- de um cadastro próprio: é derivada, no momento de salvar a ação, da
-- matrícula do usuário que abriu a ação (antes chamado "Fiscal"),
-- cruzando com sesmt_pessoas.regional (ver buscarRegionalPorMatriculaSesmt
-- em src/lib/sesmt.js). Se o usuário não estiver cadastrado em
-- sesmt_pessoas, fica null — a ação só aparece com o filtro "Todas".

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_acoes add column if not exists regional text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_acoes add column if not exists regional text;

notify pgrst, 'reload schema';
