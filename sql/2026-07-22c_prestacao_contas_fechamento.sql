-- Aplicar em ambos schemas: dev e public via Codex
-- Fechamento da Prestação de Contas: quando o financeiro processa um lote
-- de prestações aprovadas de um período, elas saem da fila "Aprovadas —
-- Exportar" e passam pro status FECHADA, vinculadas a um registro de
-- fechamento (pc_fechamentos) — isso dá rastreabilidade de quando/quem
-- fechou, quantas prestações e qual valor total entrou em cada lote, e
-- permite reabrir/reexportar um fechamento específico depois.

CREATE TABLE IF NOT EXISTS dev.pc_fechamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_fechamento text NOT NULL UNIQUE,
  fechado_por bigint NOT NULL,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  periodo_de date,
  periodo_ate date,
  qtd_prestacoes int NOT NULL DEFAULT 0,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pc_fechamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_fechamento text NOT NULL UNIQUE,
  fechado_por bigint NOT NULL,
  fechado_em timestamptz NOT NULL DEFAULT now(),
  periodo_de date,
  periodo_ate date,
  qtd_prestacoes int NOT NULL DEFAULT 0,
  valor_total numeric(12,2) NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev.pc_prestacoes ADD COLUMN IF NOT EXISTS fechamento_id bigint REFERENCES dev.pc_fechamentos(id);
ALTER TABLE public.pc_prestacoes ADD COLUMN IF NOT EXISTS fechamento_id bigint REFERENCES public.pc_fechamentos(id);

CREATE INDEX IF NOT EXISTS idx_dev_pc_prestacoes_fechamento ON dev.pc_prestacoes (fechamento_id);
CREATE INDEX IF NOT EXISTS idx_public_pc_prestacoes_fechamento ON public.pc_prestacoes (fechamento_id);

ALTER TABLE dev.pc_fechamentos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_fechamentos TO anon, authenticated;
ALTER TABLE public.pc_fechamentos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_fechamentos TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
