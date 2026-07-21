-- Aplicar em ambos schemas: dev e public via Codex
-- Módulo Prestação de Contas (isolado): usuário registra despesas (espelhando
-- a planilha "CAIXA" usada hoje pelo Gileno), anexa fotos dos comprovantes e
-- envia para um destinatário aprovar (paga + marca aprovado) ou rejeitar
-- (volta para correção). Sem FK para nenhuma tabela de negócio existente —
-- remetente_id/destinatario_id/analisado_por guardam o id de usuarios, mas
-- sem REFERENCES formal: a tabela usuarios não tem unique/PK em id no banco
-- real (mesmo padrão já usado em usuarios_processos/usuarios_regionais).
-- Integridade é controlada na aplicação, como o resto do projeto.

-- =========================
-- DESENVOLVIMENTO: schema dev
-- =========================
CREATE TABLE IF NOT EXISTS dev.pc_prestacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_pc text NOT NULL UNIQUE,
  remetente_id bigint NOT NULL,
  destinatario_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO | ENVIADO | APROVADO | REJEITADO
  rodada int NOT NULL DEFAULT 1,
  motivo_rejeicao text,
  enviado_em timestamptz,
  analisado_em timestamptz,
  analisado_por bigint,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_pc_prestacoes_remetente ON dev.pc_prestacoes (remetente_id);
CREATE INDEX IF NOT EXISTS idx_dev_pc_prestacoes_destinatario ON dev.pc_prestacoes (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_dev_pc_prestacoes_status ON dev.pc_prestacoes (status);

CREATE TABLE IF NOT EXISTS dev.pc_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestacao_id bigint NOT NULL REFERENCES dev.pc_prestacoes(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  classificacao text NOT NULL,
  descricao text NOT NULL,
  fornecedor text,
  forma_pagamento text,
  tipo_comprovante text,
  data_emissao date,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  valor_pago numeric(12,2),
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_pc_itens_prestacao ON dev.pc_itens (prestacao_id);

CREATE TABLE IF NOT EXISTS dev.pc_fotos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES dev.pc_itens(id) ON DELETE CASCADE,
  foto_url text NOT NULL,
  capturada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_pc_fotos_item ON dev.pc_fotos (item_id);

-- =========================
-- PRODUÇÃO: schema public
-- =========================
CREATE TABLE IF NOT EXISTS public.pc_prestacoes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_pc text NOT NULL UNIQUE,
  remetente_id bigint NOT NULL,
  destinatario_id bigint NOT NULL,
  status text NOT NULL DEFAULT 'RASCUNHO', -- RASCUNHO | ENVIADO | APROVADO | REJEITADO
  rodada int NOT NULL DEFAULT 1,
  motivo_rejeicao text,
  enviado_em timestamptz,
  analisado_em timestamptz,
  analisado_por bigint,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_pc_prestacoes_remetente ON public.pc_prestacoes (remetente_id);
CREATE INDEX IF NOT EXISTS idx_public_pc_prestacoes_destinatario ON public.pc_prestacoes (destinatario_id);
CREATE INDEX IF NOT EXISTS idx_public_pc_prestacoes_status ON public.pc_prestacoes (status);

CREATE TABLE IF NOT EXISTS public.pc_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestacao_id bigint NOT NULL REFERENCES public.pc_prestacoes(id) ON DELETE CASCADE,
  ordem int NOT NULL DEFAULT 0,
  classificacao text NOT NULL,
  descricao text NOT NULL,
  fornecedor text,
  forma_pagamento text,
  tipo_comprovante text,
  data_emissao date,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  valor_pago numeric(12,2),
  observacao text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_pc_itens_prestacao ON public.pc_itens (prestacao_id);

CREATE TABLE IF NOT EXISTS public.pc_fotos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id bigint NOT NULL REFERENCES public.pc_itens(id) ON DELETE CASCADE,
  foto_url text NOT NULL,
  capturada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_pc_fotos_item ON public.pc_fotos (item_id);

-- =========================
-- Padrão do projeto: sem RLS, acesso controlado na aplicação (ver CLAUDE.md 5.2)
-- =========================
ALTER TABLE dev.pc_prestacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_prestacoes TO anon, authenticated;
ALTER TABLE dev.pc_itens DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_itens TO anon, authenticated;
ALTER TABLE dev.pc_fotos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_fotos TO anon, authenticated;

ALTER TABLE public.pc_prestacoes DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_prestacoes TO anon, authenticated;
ALTER TABLE public.pc_itens DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_itens TO anon, authenticated;
ALTER TABLE public.pc_fotos DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_fotos TO anon, authenticated;

-- Sequences também precisam de GRANT pra permitir insert com identity column
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- =========================
-- Storage: bucket próprio para os comprovantes (criar manualmente no
-- Supabase Storage caso ainda não exista — nome: comprovantes-prestacao)
-- =========================

notify pgrst, 'reload schema';
