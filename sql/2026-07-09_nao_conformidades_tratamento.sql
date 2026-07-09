-- Aplicar em ambos schemas: dev e public via Codex
-- Tratamento de Não Conformidades — colunas de tratamento na tabela
-- auditorias_nao_conformes (a tabela já existe hoje, escrita por
-- S6Resultado.jsx/sincronizarNCs — este script é idempotente e cobre
-- tanto o caso de já existir quanto o de precisar ser criada do zero).

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE TABLE IF NOT EXISTS dev.auditorias_nao_conformes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auditoria_id bigint NOT NULL,
  item_id text NOT NULL,
  item_texto text,
  fiscal text,
  matricula text,
  prefixo text,
  os text,
  uc text,
  nome_eletricista text,
  nome_eletricista2 text,
  motivo_auditoria text,
  avaliacao_motivo_auditoria text,
  observacoes_motivo_auditoria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auditorias_nao_conformes_auditoria_item_dev UNIQUE (auditoria_id, item_id)
);

ALTER TABLE dev.auditorias_nao_conformes
  ADD COLUMN IF NOT EXISTS numero_as text,
  ADD COLUMN IF NOT EXISTS tipo_auditoria text,
  ADD COLUMN IF NOT EXISTS status_tratamento text NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS tratamento_observacao text,
  ADD COLUMN IF NOT EXISTS tratamento_evidencias_urls jsonb,
  ADD COLUMN IF NOT EXISTS tratamento_assinatura_url text,
  ADD COLUMN IF NOT EXISTS tratamento_assinatura_nome text,
  ADD COLUMN IF NOT EXISTS tratamento_fiscal_assinatura_url text,
  ADD COLUMN IF NOT EXISTS tratado_por text,
  ADD COLUMN IF NOT EXISTS tratado_em timestamptz,
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE dev.auditorias_nao_conformes
  DROP CONSTRAINT IF EXISTS auditorias_nao_conformes_status_tratamento_check_dev;

ALTER TABLE dev.auditorias_nao_conformes
  ADD CONSTRAINT auditorias_nao_conformes_status_tratamento_check_dev
  CHECK (status_tratamento IN ('PENDENTE', 'TRATADA'));

CREATE INDEX IF NOT EXISTS idx_dev_auditorias_nao_conformes_auditoria_id
  ON dev.auditorias_nao_conformes (auditoria_id);

CREATE INDEX IF NOT EXISTS idx_dev_auditorias_nao_conformes_numero_as
  ON dev.auditorias_nao_conformes (numero_as);

CREATE INDEX IF NOT EXISTS idx_dev_auditorias_nao_conformes_status_tratamento
  ON dev.auditorias_nao_conformes (status_tratamento);

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE TABLE IF NOT EXISTS public.auditorias_nao_conformes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  auditoria_id bigint NOT NULL,
  item_id text NOT NULL,
  item_texto text,
  fiscal text,
  matricula text,
  prefixo text,
  os text,
  uc text,
  nome_eletricista text,
  nome_eletricista2 text,
  motivo_auditoria text,
  avaliacao_motivo_auditoria text,
  observacoes_motivo_auditoria text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auditorias_nao_conformes_auditoria_item_public UNIQUE (auditoria_id, item_id)
);

ALTER TABLE public.auditorias_nao_conformes
  ADD COLUMN IF NOT EXISTS numero_as text,
  ADD COLUMN IF NOT EXISTS tipo_auditoria text,
  ADD COLUMN IF NOT EXISTS status_tratamento text NOT NULL DEFAULT 'PENDENTE',
  ADD COLUMN IF NOT EXISTS tratamento_observacao text,
  ADD COLUMN IF NOT EXISTS tratamento_evidencias_urls jsonb,
  ADD COLUMN IF NOT EXISTS tratamento_assinatura_url text,
  ADD COLUMN IF NOT EXISTS tratamento_assinatura_nome text,
  ADD COLUMN IF NOT EXISTS tratamento_fiscal_assinatura_url text,
  ADD COLUMN IF NOT EXISTS tratado_por text,
  ADD COLUMN IF NOT EXISTS tratado_em timestamptz,
  ADD COLUMN IF NOT EXISTS criado_em timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.auditorias_nao_conformes
  DROP CONSTRAINT IF EXISTS auditorias_nao_conformes_status_tratamento_check_public;

ALTER TABLE public.auditorias_nao_conformes
  ADD CONSTRAINT auditorias_nao_conformes_status_tratamento_check_public
  CHECK (status_tratamento IN ('PENDENTE', 'TRATADA'));

CREATE INDEX IF NOT EXISTS idx_public_auditorias_nao_conformes_auditoria_id
  ON public.auditorias_nao_conformes (auditoria_id);

CREATE INDEX IF NOT EXISTS idx_public_auditorias_nao_conformes_numero_as
  ON public.auditorias_nao_conformes (numero_as);

CREATE INDEX IF NOT EXISTS idx_public_auditorias_nao_conformes_status_tratamento
  ON public.auditorias_nao_conformes (status_tratamento);

-- =========================
-- Padrão do projeto: sem RLS, acesso controlado na aplicação (ver CLAUDE.md 5.2)
-- =========================
ALTER TABLE dev.auditorias_nao_conformes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.auditorias_nao_conformes TO anon, authenticated;

ALTER TABLE public.auditorias_nao_conformes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.auditorias_nao_conformes TO anon, authenticated;

notify pgrst, 'reload schema';
