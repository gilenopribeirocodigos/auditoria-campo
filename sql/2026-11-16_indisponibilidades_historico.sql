-- Aplicar em ambos schemas: dev e public via Codex
--
-- Trilha de auditoria pra edição de motivo na aba Extrato do Dashboard de
-- Indisponibilidade (src/pages/DashboardIndisponibilidade.jsx). Guarda quem
-- trocou o quê, quando, e o valor anterior — sem isso, trocar "FALTA
-- INJUSTIFICADA" por "ATESTADO MEDICO" (ex.: eletricista que não tinha
-- avisado de manhã e trouxe o atestado à tarde) apaga a informação de que
-- aquilo foi uma correção posterior, não o lançamento original.

CREATE TABLE IF NOT EXISTS dev.indisponibilidades_historico (
  id                    SERIAL PRIMARY KEY,
  indisponibilidade_id  INTEGER NOT NULL,
  data                  DATE,
  matricula             VARCHAR,
  colaborador           TEXT,
  prefixo               VARCHAR,
  motivo_id_anterior    INTEGER,
  motivo_anterior       TEXT,
  motivo_id_novo        INTEGER,
  motivo_novo           TEXT,
  alterado_por          TEXT,
  alterado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dev.indisponibilidades_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.indisponibilidades_historico TO anon, authenticated;
GRANT ALL ON SEQUENCE dev.indisponibilidades_historico_id_seq TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.indisponibilidades_historico (
  id                    SERIAL PRIMARY KEY,
  indisponibilidade_id  INTEGER NOT NULL,
  data                  DATE,
  matricula             VARCHAR,
  colaborador           TEXT,
  prefixo               VARCHAR,
  motivo_id_anterior    INTEGER,
  motivo_anterior       TEXT,
  motivo_id_novo        INTEGER,
  motivo_novo           TEXT,
  alterado_por          TEXT,
  alterado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.indisponibilidades_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.indisponibilidades_historico TO anon, authenticated;
GRANT ALL ON SEQUENCE public.indisponibilidades_historico_id_seq TO anon, authenticated;
