-- Aplicar em ambos schemas: dev e public via Codex
-- Permissão POR USUÁRIO (não por perfil) pra Prestação de Contas:
-- a) aprovador: só quem tiver isso marcado aparece na lista "Enviar para"
--    (substitui o critério antigo, que era por permissão de perfil).
-- b) acesso_botao: tri-state (NULL = segue a permissão de perfil normal;
--    true = sempre libera o botão da Home; false = sempre bloqueia) —
--    permissão de usuário é mais forte que permissão de perfil.
-- Tabela isolada do módulo — não altera a tabela usuarios.

CREATE TABLE IF NOT EXISTS dev.pc_permissoes_usuario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL UNIQUE,
  aprovador boolean NOT NULL DEFAULT false,
  acesso_botao boolean,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pc_permissoes_usuario (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id bigint NOT NULL UNIQUE,
  aprovador boolean NOT NULL DEFAULT false,
  acesso_botao boolean,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dev.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;
GRANT ALL ON dev.pc_permissoes_usuario TO anon, authenticated;
ALTER TABLE public.pc_permissoes_usuario DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.pc_permissoes_usuario TO anon, authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA dev TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

notify pgrst, 'reload schema';
