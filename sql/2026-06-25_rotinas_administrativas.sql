-- Rotinas Administrativas
-- Executar em desenvolvimento (schema dev) e produção (schema public).
-- Também remove as tabelas antigas de aprendizes aprovadas para limpeza.

-- Limpeza de tabelas antigas
DROP TABLE IF EXISTS dev.diario_aprendiz CASCADE;
DROP TABLE IF EXISTS dev.aprendizes CASCADE;
DROP TABLE IF EXISTS public.diario_aprendiz CASCADE;
DROP TABLE IF EXISTS public.aprendizes CASCADE;

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE TABLE IF NOT EXISTS dev.rotinas_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  horario_previsto time NOT NULL,
  prioridade text NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'CRITICA')),
  responsavel_login text,
  perfil_responsavel text,
  recorrencia text NOT NULL DEFAULT 'DIARIA',
  ativa boolean NOT NULL DEFAULT true,
  criado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev.rotinas_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_modelo_id uuid REFERENCES dev.rotinas_modelos(id) ON DELETE SET NULL,
  data_execucao date NOT NULL,
  titulo_snapshot text NOT NULL,
  descricao_snapshot text,
  horario_previsto time NOT NULL,
  prioridade text NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'CRITICA')),
  responsavel_login text,
  perfil_responsavel text,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ATRASADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  concluida_por text,
  cancelada_em timestamptz,
  cancelada_por text,
  observacao_final text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rotinas_execucoes_modelo_data_dev UNIQUE (rotina_modelo_id, data_execucao)
);

CREATE TABLE IF NOT EXISTS dev.rotinas_subrotinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_execucao_id uuid NOT NULL REFERENCES dev.rotinas_execucoes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDA', 'CANCELADA')),
  responsavel_login text,
  observacao text,
  concluida_em timestamptz,
  concluida_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dev.rotinas_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_execucao_id uuid NOT NULL REFERENCES dev.rotinas_execucoes(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  usuario_registro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rotinas_modelos_dev_ativa_hora ON dev.rotinas_modelos (ativa, horario_previsto);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_dev_data_status ON dev.rotinas_execucoes (data_execucao, status);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_dev_responsavel ON dev.rotinas_execucoes (responsavel_login, perfil_responsavel);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_dev_execucao ON dev.rotinas_subrotinas (rotina_execucao_id);
CREATE INDEX IF NOT EXISTS idx_rotinas_diario_dev_execucao ON dev.rotinas_diario (rotina_execucao_id, created_at DESC);

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE TABLE IF NOT EXISTS public.rotinas_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  horario_previsto time NOT NULL,
  prioridade text NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'CRITICA')),
  responsavel_login text,
  perfil_responsavel text,
  recorrencia text NOT NULL DEFAULT 'DIARIA',
  ativa boolean NOT NULL DEFAULT true,
  criado_por text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rotinas_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_modelo_id uuid REFERENCES public.rotinas_modelos(id) ON DELETE SET NULL,
  data_execucao date NOT NULL,
  titulo_snapshot text NOT NULL,
  descricao_snapshot text,
  horario_previsto time NOT NULL,
  prioridade text NOT NULL DEFAULT 'NORMAL' CHECK (prioridade IN ('BAIXA', 'NORMAL', 'ALTA', 'CRITICA')),
  responsavel_login text,
  perfil_responsavel text,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'ATRASADA', 'EM_ANDAMENTO', 'CONCLUIDA', 'CANCELADA')),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  concluida_por text,
  cancelada_em timestamptz,
  cancelada_por text,
  observacao_final text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rotinas_execucoes_modelo_data_public UNIQUE (rotina_modelo_id, data_execucao)
);

CREATE TABLE IF NOT EXISTS public.rotinas_subrotinas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_execucao_id uuid NOT NULL REFERENCES public.rotinas_execucoes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'CONCLUIDA', 'CANCELADA')),
  responsavel_login text,
  observacao text,
  concluida_em timestamptz,
  concluida_por text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rotinas_diario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rotina_execucao_id uuid NOT NULL REFERENCES public.rotinas_execucoes(id) ON DELETE CASCADE,
  descricao text NOT NULL,
  usuario_registro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rotinas_modelos_public_ativa_hora ON public.rotinas_modelos (ativa, horario_previsto);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_public_data_status ON public.rotinas_execucoes (data_execucao, status);
CREATE INDEX IF NOT EXISTS idx_rotinas_execucoes_public_responsavel ON public.rotinas_execucoes (responsavel_login, perfil_responsavel);
CREATE INDEX IF NOT EXISTS idx_rotinas_subrotinas_public_execucao ON public.rotinas_subrotinas (rotina_execucao_id);
CREATE INDEX IF NOT EXISTS idx_rotinas_diario_public_execucao ON public.rotinas_diario (rotina_execucao_id, created_at DESC);

-- Verificação rápida após executar:
-- SELECT table_schema, table_name
-- FROM information_schema.tables
-- WHERE table_schema IN ('dev', 'public')
--   AND table_name IN ('rotinas_modelos', 'rotinas_execucoes', 'rotinas_subrotinas', 'rotinas_diario', 'aprendizes', 'diario_aprendiz')
-- ORDER BY table_schema, table_name;
