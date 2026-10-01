-- Aplicar em ambos schemas: dev e public via Codex
--
-- "Tratado por" só gravava a matrícula de quem tratou a ocorrência — pro
-- card de PDF/WhatsApp mostrar também o NOME de quem tratou (não só a
-- matrícula), precisa de uma coluna a mais. Ocorrências tratadas ANTES
-- desta coluna existir continuam só com a matrícula (sem nome).

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.ocorrencias add column if not exists tratado_por_nome text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.ocorrencias add column if not exists tratado_por_nome text;

notify pgrst, 'reload schema';
