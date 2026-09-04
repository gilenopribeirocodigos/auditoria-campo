-- Aplicar em ambos schemas: dev e public via Codex
--
-- Numero_Acao — identificador unico e legivel de cada acao SESMT, no
-- mesmo padrao visual do "Numero AS" das Auditorias: SESMT-AAAAMMDD-
-- HHMMSS-XXXX. Gerado uma unica vez no front (gerarNumeroAcaoSesmt em
-- src/lib/sesmt.js) ao iniciar uma nova acao, e gravado junto com o
-- resto do payload em prepararPayloadSesmt.
--
-- Sem backfill: acoes ja existentes ficam com numero_acao null — a
-- exportacao/exibicao usa numeroAcaoSesmt(acao) (mesmo lib/sesmt.js),
-- que gera um numero "legado" a partir do id/data/hora so na hora de
-- mostrar, sem precisar mexer nos dados ja salvos.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.sesmt_acoes add column if not exists numero_acao text;

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.sesmt_acoes add column if not exists numero_acao text;

notify pgrst, 'reload schema';
