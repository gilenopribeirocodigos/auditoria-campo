-- Aplicar em ambos schemas: dev e public via Codex
--
-- Fluxo de troca de senha: hoje todo usuário é criado com a mesma senha
-- padrão (ex.: 123456) — qualquer um consegue logar com o usuário de
-- outra pessoa. Adiciona uma flag `precisa_trocar_senha` em `usuarios`:
-- quando true, o app bloqueia o Home logo após o login e força a
-- pessoa a definir uma senha só dela antes de continuar (ver
-- src/pages/DefinirNovaSenha.jsx). Usada em dois momentos:
-- 1) Nesta migration, marcando todo mundo que está ativo hoje — força
--    a troca da senha padrão compartilhada, de uma vez, no próximo login
--    de cada um (inclui o(s) perfil(is) ADMIN, por decisão do Gileno).
-- 2) Daqui pra frente, toda vez que um admin resetar a senha de alguém
--    pela tela de Gestão de Usuários (botão 🔑 "Resetar Senha").
--
-- Autoatendimento (self-service, tela "🔑 Alterar Senha" no Home) não
-- depende dessa flag — funciona a qualquer momento, com qualquer
-- usuário, independente de precisar ou não trocar.

-- DESENVOLVIMENTO ─────────────────────────────────────────────────────────────

alter table dev.usuarios add column if not exists precisa_trocar_senha boolean not null default false;

update dev.usuarios set precisa_trocar_senha = true where status = 'ATIVO';

-- PRODUCAO ────────────────────────────────────────────────────────────────────

alter table public.usuarios add column if not exists precisa_trocar_senha boolean not null default false;

update public.usuarios set precisa_trocar_senha = true where status = 'ATIVO';

notify pgrst, 'reload schema';
