-- Aplicar em ambos schemas: dev e public via Codex
-- Fix: garante a constraint UNIQUE (auditoria_id, item_id) em
-- auditorias_nao_conformes mesmo quando a tabela já existia antes desta
-- feature. Nesse caso, o `CREATE TABLE IF NOT EXISTS` do script
-- 2026-07-09_nao_conformidades_tratamento.sql não executa o corpo da
-- tabela (ela já existe) — e a constraint nunca chega a ser criada,
-- fazendo o `upsert(... onConflict: 'auditoria_id,item_id')` do app
-- falhar silenciosamente (o erro só vai pro console do navegador, sem
-- travar o salvamento da auditoria — por isso a NC "some" da tabela
-- auxiliar mas a auditoria salva normal).

DO $$ BEGIN
  ALTER TABLE dev.auditorias_nao_conformes
    ADD CONSTRAINT auditorias_nao_conformes_auditoria_item_dev UNIQUE (auditoria_id, item_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.auditorias_nao_conformes
    ADD CONSTRAINT auditorias_nao_conformes_auditoria_item_public UNIQUE (auditoria_id, item_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

notify pgrst, 'reload schema';
