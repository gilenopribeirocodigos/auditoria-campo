-- Aplicar em ambos schemas: dev e public via Codex
-- Histórico de análise da Prestação de Contas: cada envio/aprovação/rejeição
-- vira uma linha imutável aqui, em vez de sobrescrever motivo_rejeicao/
-- analisado_em/analisado_por a cada rodada (que só guardam o estado ATUAL,
-- mantidos por conveniência nas listagens). Isso preserva o motivo de toda
-- rejeição anterior mesmo depois de reenviar e ser rejeitado de novo.

CREATE TABLE IF NOT EXISTS dev.pc_historico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestacao_id bigint NOT NULL REFERENCES dev.pc_prestacoes(id) ON DELETE CASCADE,
  tipo text NOT NULL, -- ENVIO | APROVACAO | REJEICAO
  usuario_id bigint NOT NULL,
  motivo text,
  rodada int NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dev_pc_historico_prestacao ON dev.pc_historico (prestacao_id);

CREATE TABLE IF NOT EXISTS public.pc_historico (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  prestacao_id bigint NOT NULL REFERENCES public.pc_prestacoes(id) ON DELETE CASCADE,
  tipo text NOT NULL, -- ENVIO | APROVACAO | REJEICAO
  usuario_id bigint NOT NULL,
  motivo text,
  rodada int NOT NULL DEFAULT 1,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_public_pc_historico_prestacao ON public.pc_historico (prestacao_id);

ALTER TABLE dev.pc_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_historico TO anon, authenticated;
ALTER TABLE public.pc_historico DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_historico TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
