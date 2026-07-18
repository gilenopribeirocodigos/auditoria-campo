-- Aplicar em ambos schemas: dev e public via Codex
-- Fiscais em Campo: cadastro de Bases Operacionais (nome, regional,
-- latitude/longitude e raio em km) usado para classificar se o fiscal
-- está dentro ou fora da base (geofencing) e medir tempo dentro/fora.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE TABLE IF NOT EXISTS dev.bases_operacionais (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  regional text,
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  raio_km numeric(6,2) NOT NULL DEFAULT 1.0,
  ativo boolean NOT NULL DEFAULT true,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_bases_operacionais_ativo
  ON dev.bases_operacionais (ativo);

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE TABLE IF NOT EXISTS public.bases_operacionais (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  regional text,
  latitude numeric(10,6) NOT NULL,
  longitude numeric(10,6) NOT NULL,
  raio_km numeric(6,2) NOT NULL DEFAULT 1.0,
  ativo boolean NOT NULL DEFAULT true,
  criado_por text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_bases_operacionais_ativo
  ON public.bases_operacionais (ativo);

-- =========================
-- Padrão do projeto: sem RLS, acesso controlado na aplicação (ver CLAUDE.md 5.2)
-- =========================
ALTER TABLE dev.bases_operacionais DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.bases_operacionais TO anon, authenticated;

ALTER TABLE public.bases_operacionais DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.bases_operacionais TO anon, authenticated;

notify pgrst, 'reload schema';
